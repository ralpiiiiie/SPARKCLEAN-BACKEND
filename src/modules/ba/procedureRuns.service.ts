import { and, asc, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { baProcedureRuns, baProcedureSteps } from "../../db/schema/index.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import type {
  procedureRunCreateSchema,
  procedureRunQuerySchema,
  procedureStepCreateSchema,
  procedureStepUpdateSchema,
} from "./procedureRuns.validation.js";

type RunQuery = z.infer<typeof procedureRunQuerySchema>;
type RunCreate = z.infer<typeof procedureRunCreateSchema>;
type StepCreate = z.infer<typeof procedureStepCreateSchema>;
type StepUpdate = z.infer<typeof procedureStepUpdateSchema>;

export const DEFAULT_STEPS = [
  "Collect costs",
  "Update monthly demand",
  "Check plant capacity",
  "Rerun curve fitting",
  "Forecast demand",
  "Build optimization model",
  "Solve and extract schedule",
];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function stepsFor(runIds: number[]) {
  if (runIds.length === 0) return new Map<number, Array<typeof baProcedureSteps.$inferSelect>>();
  const rows = await db
    .select()
    .from(baProcedureSteps)
    .where(inArray(baProcedureSteps.runId, runIds))
    .orderBy(asc(baProcedureSteps.stepNo));
  const map = new Map<number, Array<typeof baProcedureSteps.$inferSelect>>();
  for (const row of rows) {
    const list = map.get(row.runId) ?? [];
    list.push(row);
    map.set(row.runId, list);
  }
  return map;
}

async function syncRunStatus(tx: Tx, runId: number) {
  const steps = await tx
    .select({ done: baProcedureSteps.done })
    .from(baProcedureSteps)
    .where(eq(baProcedureSteps.runId, runId));
  const done = steps.filter((step) => step.done).length;
  const status =
    steps.length > 0 && done === steps.length
      ? "Completed"
      : done > 0
        ? "In progress"
        : "Not started";
  await tx
    .update(baProcedureRuns)
    .set({ status, updatedAt: new Date() })
    .where(eq(baProcedureRuns.id, runId));
}

export async function listRuns(query: RunQuery) {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(baProcedureRuns.status, query.status));
  if (query.search) conditions.push(ilike(baProcedureRuns.periodLabel, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(baProcedureRuns)
      .where(where)
      .orderBy(desc(baProcedureRuns.monthNo))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(baProcedureRuns).where(where),
  ]);
  const steps = await stepsFor(rows.map((row) => row.id));

  return {
    data: rows.map((run) => ({ ...run, steps: steps.get(run.id) ?? [] })),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getRun(id: number) {
  const [row] = await db.select().from(baProcedureRuns).where(eq(baProcedureRuns.id, id));
  if (!row) throw ApiError.notFound("Procedure run not found");
  const steps = await stepsFor([id]);
  return { ...row, steps: steps.get(id) ?? [] };
}

export async function createRun(input: RunCreate) {
  const id = await db.transaction(async (tx) => {
    const [run] = await tx.insert(baProcedureRuns).values(input).returning({
      id: baProcedureRuns.id,
    });
    await tx.insert(baProcedureSteps).values(
      DEFAULT_STEPS.map((title, index) => ({
        runId: run.id,
        stepNo: index + 1,
        title,
      })),
    );
    return run.id;
  });
  return getRun(id);
}

export async function updateRun(id: number, patch: Partial<RunCreate>) {
  const [updated] = await db
    .update(baProcedureRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(baProcedureRuns.id, id))
    .returning({ id: baProcedureRuns.id });
  if (!updated) throw ApiError.notFound("Procedure run not found");
  return getRun(id);
}

export async function deleteRun(id: number) {
  const [deleted] = await db
    .delete(baProcedureRuns)
    .where(eq(baProcedureRuns.id, id))
    .returning({ id: baProcedureRuns.id });
  if (!deleted) throw ApiError.notFound("Procedure run not found");
  return { id: deleted.id, deleted: true };
}

export async function createStep(runId: number, input: StepCreate) {
  const [run] = await db.select().from(baProcedureRuns).where(eq(baProcedureRuns.id, runId));
  if (!run) throw ApiError.notFound("Procedure run not found");

  const id = await db.transaction(async (tx) => {
    const [step] = await tx
      .insert(baProcedureSteps)
      .values({
        ...input,
        runId,
        doneAt: input.done ? new Date() : null,
      })
      .returning({ id: baProcedureSteps.id });
    await syncRunStatus(tx, runId);
    return step.id;
  });
  const [created] = await db.select().from(baProcedureSteps).where(eq(baProcedureSteps.id, id));
  return created;
}

export async function updateStep(
  runId: number,
  stepId: number,
  patch: StepUpdate,
) {
  const [existing] = await db
    .select()
    .from(baProcedureSteps)
    .where(and(eq(baProcedureSteps.id, stepId), eq(baProcedureSteps.runId, runId)));
  if (!existing) throw ApiError.notFound("Procedure step not found");

  const doneAt =
    patch.done === true
      ? patch.doneAt
        ? new Date(patch.doneAt)
        : existing.doneAt ?? new Date()
      : patch.done === false
        ? null
        : patch.doneAt !== undefined
          ? patch.doneAt === null
            ? null
            : new Date(patch.doneAt)
          : existing.doneAt;

  await db.transaction(async (tx) => {
    await tx
      .update(baProcedureSteps)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.done !== undefined ? { done: patch.done } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        doneAt,
        updatedAt: new Date(),
      })
      .where(eq(baProcedureSteps.id, stepId));
    await syncRunStatus(tx, runId);
  });

  const [updated] = await db
    .select()
    .from(baProcedureSteps)
    .where(eq(baProcedureSteps.id, stepId));
  return updated;
}

export async function deleteStep(runId: number, stepId: number) {
  const [deleted] = await db
    .delete(baProcedureSteps)
    .where(and(eq(baProcedureSteps.id, stepId), eq(baProcedureSteps.runId, runId)))
    .returning({ id: baProcedureSteps.id });
  if (!deleted) throw ApiError.notFound("Procedure step not found");
  await db.transaction(async (tx) => syncRunStatus(tx, runId));
  return { id: deleted.id, deleted: true };
}
