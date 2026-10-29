import { asc, desc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { costAssumptions } from "../../db/schema/index.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";
import type {
  costAssumptionCreateSchema,
  costAssumptionUpdateSchema,
} from "./costAssumptions.validation.js";

const serialize = (row: typeof costAssumptions.$inferSelect) => ({
  ...row,
  rushCostPerLoad: toNumber(row.rushCostPerLoad),
  storageCostPerLoad: toNumber(row.storageCostPerLoad),
});

export async function listCostAssumptions() {
  const rows = await db
    .select()
    .from(costAssumptions)
    .orderBy(desc(costAssumptions.isActive), asc(costAssumptions.name));
  return rows.map(serialize);
}

export async function getCostAssumption(id: number) {
  const [row] = await db.select().from(costAssumptions).where(eq(costAssumptions.id, id));
  if (!row) throw ApiError.notFound("Cost assumption not found");
  return serialize(row);
}

export async function getActiveCostAssumption() {
  const [row] = await db
    .select()
    .from(costAssumptions)
    .where(eq(costAssumptions.isActive, true))
    .limit(1);
  return row ? serialize(row) : null;
}

export async function createCostAssumption(
  input: z.infer<typeof costAssumptionCreateSchema>,
) {
  const createdId = await db.transaction(async (tx) => {
    if (input.isActive) {
      await tx.update(costAssumptions).set({ isActive: false }).where(eq(costAssumptions.isActive, true));
    }
    const [created] = await tx
      .insert(costAssumptions)
      .values({
        ...input,
        rushCostPerLoad: String(input.rushCostPerLoad),
        storageCostPerLoad: String(input.storageCostPerLoad),
      })
      .returning({ id: costAssumptions.id });
    return created.id;
  });
  return getCostAssumption(createdId);
}

export async function updateCostAssumption(
  id: number,
  patch: z.infer<typeof costAssumptionUpdateSchema>,
) {
  const [existing] = await db.select().from(costAssumptions).where(eq(costAssumptions.id, id));
  if (!existing) throw ApiError.notFound("Cost assumption not found");
  await db.transaction(async (tx) => {
    if (patch.isActive) {
      await tx
        .update(costAssumptions)
        .set({ isActive: false })
        .where(ne(costAssumptions.id, id));
    }
    const { rushCostPerLoad, storageCostPerLoad, ...rest } = patch;
    await tx
      .update(costAssumptions)
      .set({
        ...rest,
        ...(rushCostPerLoad !== undefined
          ? { rushCostPerLoad: String(rushCostPerLoad) }
          : {}),
        ...(storageCostPerLoad !== undefined
          ? { storageCostPerLoad: String(storageCostPerLoad) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(costAssumptions.id, id));
  });
  return getCostAssumption(id);
}

export async function activateCostAssumption(id: number) {
  const [existing] = await db.select().from(costAssumptions).where(eq(costAssumptions.id, id));
  if (!existing) throw ApiError.notFound("Cost assumption not found");
  await db.transaction(async (tx) => {
    await tx.update(costAssumptions).set({ isActive: false }).where(ne(costAssumptions.id, id));
    await tx
      .update(costAssumptions)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(costAssumptions.id, id));
  });
  return getCostAssumption(id);
}

export async function deleteCostAssumption(id: number) {
  const [deleted] = await db
    .delete(costAssumptions)
    .where(eq(costAssumptions.id, id))
    .returning({ id: costAssumptions.id });
  if (!deleted) throw ApiError.notFound("Cost assumption not found");
  return { id: deleted.id, deleted: true };
}
