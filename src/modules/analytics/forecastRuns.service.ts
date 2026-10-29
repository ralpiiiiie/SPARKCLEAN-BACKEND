import { and, asc, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { branches, forecastResults, forecastRuns } from "../../db/schema/index.js";
import type { BranchForecast, ForecastModelName } from "../../analytics/forecast.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";
import { activeOverride, computeBranchForecast } from "./forecastData.js";
import type {
  forecastQuerySchema,
  forecastRunCreateSchema,
  forecastRunQuerySchema,
  forecastRunUpdateSchema,
} from "./forecastRuns.validation.js";

type RunQuery = z.infer<typeof forecastRunQuerySchema>;
type RunCreate = z.infer<typeof forecastRunCreateSchema>;
type RunUpdate = z.infer<typeof forecastRunUpdateSchema>;

interface ForecastComputation {
  forecast: BranchForecast;
  trainingEnd: string;
}

async function compute(options: {
  branchId: string;
  model: ForecastModelName | "auto";
  horizon: number;
  validationMonths?: number;
}): Promise<ForecastComputation> {
  const forecast = await computeBranchForecast(options);
  const lastTraining = forecast.history.find(
    (point) => point.monthNo === forecast.trainingEndMonthNo,
  );
  const monthLabel =
    lastTraining?.monthLabel ?? forecast.history[forecast.history.length - 1].monthLabel;
  return { forecast, trainingEnd: `${monthLabel}-01` };
}

const serializeResult = (row: typeof forecastResults.$inferSelect) => ({
  id: row.id,
  monthNo: row.monthNo,
  forecastLoads: toNumber(row.forecastLoads),
  lower: toNumber(row.lower),
  upper: toNumber(row.upper),
});

async function resultsFor(runIds: number[]) {
  if (runIds.length === 0) return new Map<number, ReturnType<typeof serializeResult>[]>();
  const rows = await db
    .select()
    .from(forecastResults)
    .where(inArray(forecastResults.forecastRunId, runIds))
    .orderBy(asc(forecastResults.monthNo));
  const byRun = new Map<number, ReturnType<typeof serializeResult>[]>();
  for (const row of rows) {
    const list = byRun.get(row.forecastRunId) ?? [];
    list.push(serializeResult(row));
    byRun.set(row.forecastRunId, list);
  }
  return byRun;
}

export async function listRuns(query: RunQuery) {
  const conditions: SQL[] = [];
  if (query.branchId) conditions.push(eq(forecastRuns.branchId, query.branchId));
  if (query.status) conditions.push(eq(forecastRuns.status, query.status));
  if (query.model) conditions.push(eq(forecastRuns.model, query.model));
  if (query.search) conditions.push(ilike(forecastRuns.name, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: forecastRuns.id,
        name: forecastRuns.name,
        branchId: forecastRuns.branchId,
        branch: branches.name,
        model: forecastRuns.model,
        horizon: forecastRuns.horizon,
        trainingEnd: forecastRuns.trainingEnd,
        validationMonths: forecastRuns.validationMonths,
        r2: forecastRuns.r2,
        mad: forecastRuns.mad,
        status: forecastRuns.status,
        notes: forecastRuns.notes,
        createdAt: forecastRuns.createdAt,
        updatedAt: forecastRuns.updatedAt,
      })
      .from(forecastRuns)
      .innerJoin(branches, eq(forecastRuns.branchId, branches.id))
      .where(where)
      .orderBy(desc(forecastRuns.createdAt))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(forecastRuns).where(where),
  ]);

  const results = await resultsFor(rows.map((row) => row.id));
  return {
    data: rows.map((run) => ({
      ...run,
      r2: toNumber(run.r2),
      mad: toNumber(run.mad),
      results: results.get(run.id) ?? [],
    })),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getRun(id: number) {
  const [row] = await db
    .select({
      id: forecastRuns.id,
      name: forecastRuns.name,
      branchId: forecastRuns.branchId,
      branch: branches.name,
      model: forecastRuns.model,
      horizon: forecastRuns.horizon,
      trainingEnd: forecastRuns.trainingEnd,
      validationMonths: forecastRuns.validationMonths,
      r2: forecastRuns.r2,
      mad: forecastRuns.mad,
      status: forecastRuns.status,
      notes: forecastRuns.notes,
      createdAt: forecastRuns.createdAt,
      updatedAt: forecastRuns.updatedAt,
    })
    .from(forecastRuns)
    .innerJoin(branches, eq(forecastRuns.branchId, branches.id))
    .where(eq(forecastRuns.id, id));
  if (!row) throw ApiError.notFound("Forecast run not found");
  const results = await resultsFor([id]);
  return {
    ...row,
    r2: toNumber(row.r2),
    mad: toNumber(row.mad),
    results: results.get(id) ?? [],
  };
}

export async function createRun(input: RunCreate) {
  const { forecast, trainingEnd } = await compute(input);
  const runId = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(forecastRuns)
      .values({
        name: input.name,
        branchId: input.branchId,
        model: input.model,
        horizon: input.horizon,
        trainingEnd,
        validationMonths: input.validationMonths,
        r2: forecast.r2.toFixed(4),
        mad: forecast.mad.toFixed(2),
        notes: input.notes ?? null,
      })
      .returning({ id: forecastRuns.id });
    await tx.insert(forecastResults).values(
      forecast.forecast.map((point) => ({
        forecastRunId: run.id,
        monthNo: point.monthNo,
        forecastLoads: String(point.forecastLoads),
        lower: String(point.lower),
        upper: String(point.upper),
      })),
    );
    return run.id;
  });
  return getRun(runId);
}

export async function updateRun(id: number, patch: RunUpdate) {
  const [updated] = await db
    .update(forecastRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(forecastRuns.id, id))
    .returning({ id: forecastRuns.id });
  if (!updated) throw ApiError.notFound("Forecast run not found");
  return getRun(id);
}

export async function rerunRun(id: number) {
  const [existing] = await db.select().from(forecastRuns).where(eq(forecastRuns.id, id));
  if (!existing) throw ApiError.notFound("Forecast run not found");
  const { forecast, trainingEnd } = await compute({
    branchId: existing.branchId,
    model: existing.model,
    horizon: existing.horizon,
    validationMonths: existing.validationMonths,
  });
  await db.transaction(async (tx) => {
    await tx.delete(forecastResults).where(eq(forecastResults.forecastRunId, id));
    await tx.insert(forecastResults).values(
      forecast.forecast.map((point) => ({
        forecastRunId: id,
        monthNo: point.monthNo,
        forecastLoads: String(point.forecastLoads),
        lower: String(point.lower),
        upper: String(point.upper),
      })),
    );
    await tx
      .update(forecastRuns)
      .set({
        trainingEnd,
        r2: forecast.r2.toFixed(4),
        mad: forecast.mad.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(forecastRuns.id, id));
  });
  return getRun(id);
}

export async function duplicateRun(id: number) {
  const source = await getRun(id);
  return createRun({
    name: `${source.name} (copy)`,
    branchId: source.branchId,
    model: source.model,
    horizon: source.horizon,
    validationMonths: source.validationMonths,
    notes: source.notes ?? undefined,
  });
}

export async function deleteRun(id: number) {
  const [deleted] = await db
    .delete(forecastRuns)
    .where(eq(forecastRuns.id, id))
    .returning({ id: forecastRuns.id });
  if (!deleted) throw ApiError.notFound("Forecast run not found");
  return { id: deleted.id, deleted: true };
}

/** Preview used by the Predictive page; does not persist a run. */
export async function previewForecast(query: z.infer<typeof forecastQuerySchema>) {
  const forecast = await computeBranchForecast({
    branchId: query.branchId,
    model: query.model,
    horizon: query.horizon,
    validationMonths: query.validationMonths,
  });
  const override = await activeOverride(query.branchId);
  return {
    ...forecast,
    override: override ? { model: override.chosenModel, reason: override.reason } : null,
  };
}
