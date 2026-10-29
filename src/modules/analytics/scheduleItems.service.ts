import { and, asc, eq, sum, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import {
  branches,
  optimizationScenarios,
  plants,
  shippingScheduleItems,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";
import type {
  scheduleItemQuerySchema,
  scheduleItemUpdateSchema,
} from "./scheduleItems.validation.js";

type ItemQuery = z.infer<typeof scheduleItemQuerySchema>;
type ItemUpdate = z.infer<typeof scheduleItemUpdateSchema>;

const baseQuery = () =>
  db
    .select({
      id: shippingScheduleItems.id,
      scenarioId: shippingScheduleItems.scenarioId,
      plantId: shippingScheduleItems.plantId,
      plant: plants.name,
      branchId: shippingScheduleItems.branchId,
      branch: branches.name,
      loads: shippingScheduleItems.loads,
      unitCost: shippingScheduleItems.unitCost,
      totalCost: shippingScheduleItems.totalCost,
      status: shippingScheduleItems.status,
      isManualOverride: shippingScheduleItems.isManualOverride,
      createdAt: shippingScheduleItems.createdAt,
      updatedAt: shippingScheduleItems.updatedAt,
    })
    .from(shippingScheduleItems)
    .innerJoin(plants, eq(shippingScheduleItems.plantId, plants.id))
    .innerJoin(branches, eq(shippingScheduleItems.branchId, branches.id));

type ItemRow = Awaited<ReturnType<typeof baseQuery>>[number];

const serialize = (row: ItemRow) => ({
  ...row,
  loads: toNumber(row.loads),
  unitCost: toNumber(row.unitCost),
  totalCost: toNumber(row.totalCost),
});

export async function listScheduleItems(query: ItemQuery) {
  const conditions: SQL[] = [];
  if (query.scenarioId) conditions.push(eq(shippingScheduleItems.scenarioId, query.scenarioId));
  if (query.status) conditions.push(eq(shippingScheduleItems.status, query.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await baseQuery()
    .where(where)
    .orderBy(asc(plants.name), asc(branches.name));
  return rows.map(serialize);
}

export async function getScheduleItem(id: number) {
  const [row] = await baseQuery().where(eq(shippingScheduleItems.id, id));
  if (!row) throw ApiError.notFound("Schedule item not found");
  return serialize(row);
}

export async function updateScheduleItem(id: number, patch: ItemUpdate) {
  const [existing] = await db
    .select()
    .from(shippingScheduleItems)
    .where(eq(shippingScheduleItems.id, id));
  if (!existing) throw ApiError.notFound("Schedule item not found");

  const loads = patch.loads ?? toNumber(existing.loads);
  const unitCost = patch.unitCost ?? toNumber(existing.unitCost);
  const recalculated = patch.loads !== undefined || patch.unitCost !== undefined;

  await db.transaction(async (tx) => {
    await tx
      .update(shippingScheduleItems)
      .set({
        ...(patch.loads !== undefined ? { loads: String(patch.loads) } : {}),
        ...(patch.unitCost !== undefined ? { unitCost: String(patch.unitCost) } : {}),
        ...(recalculated ? { totalCost: String(Math.round(loads * unitCost)) } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        isManualOverride: patch.isManualOverride ?? (recalculated || existing.isManualOverride),
        updatedAt: new Date(),
      })
      .where(eq(shippingScheduleItems.id, id));

    const [totals] = await tx
      .select({ total: sum(shippingScheduleItems.totalCost) })
      .from(shippingScheduleItems)
      .where(eq(shippingScheduleItems.scenarioId, existing.scenarioId));

    if (totals?.total !== null && totals?.total !== undefined) {
      const totalCost = toNumber(totals.total);
      const [scenario] = await tx
        .select()
        .from(optimizationScenarios)
        .where(eq(optimizationScenarios.id, existing.scenarioId));
      if (scenario) {
        const baseline = scenario.baselineCost === null ? null : toNumber(scenario.baselineCost);
        const savings = baseline === null ? null : baseline - totalCost;
        await tx
          .update(optimizationScenarios)
          .set({
            totalCost: String(Math.round(totalCost)),
            savingsAmount: savings === null ? null : String(Math.round(savings)),
            savingsPct:
              savings === null || !baseline ? null : ((savings / baseline) * 100).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(optimizationScenarios.id, existing.scenarioId));
      }
    }
  });

  return getScheduleItem(id);
}
