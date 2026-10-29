import { and, asc, eq, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { branches, modelOverrides } from "../../db/schema/index.js";
import { ApiError } from "../../utils/errors.js";
import type {
  modelOverrideCreateSchema,
  modelOverrideQuerySchema,
} from "./modelOverrides.validation.js";

type OverrideQuery = z.infer<typeof modelOverrideQuerySchema>;

const baseQuery = () =>
  db
    .select({
      id: modelOverrides.id,
      branchId: modelOverrides.branchId,
      branch: branches.name,
      chosenModel: modelOverrides.chosenModel,
      reason: modelOverrides.reason,
      active: modelOverrides.active,
      createdAt: modelOverrides.createdAt,
      updatedAt: modelOverrides.updatedAt,
    })
    .from(modelOverrides)
    .innerJoin(branches, eq(modelOverrides.branchId, branches.id));

export async function listOverrides(query: OverrideQuery) {
  const conditions: SQL[] = [];
  if (query.branchId) conditions.push(eq(modelOverrides.branchId, query.branchId));
  if (query.active !== undefined) conditions.push(eq(modelOverrides.active, query.active));
  const where = conditions.length ? and(...conditions) : undefined;
  return baseQuery().where(where).orderBy(asc(branches.name));
}

export async function getOverride(id: number) {
  const [row] = await baseQuery().where(eq(modelOverrides.id, id));
  if (!row) throw ApiError.notFound("Model override not found");
  return row;
}

export async function upsertOverride(input: z.infer<typeof modelOverrideCreateSchema>) {
  const [row] = await db
    .insert(modelOverrides)
    .values(input)
    .onConflictDoUpdate({
      target: modelOverrides.branchId,
      set: {
        chosenModel: input.chosenModel,
        reason: input.reason,
        active: input.active,
        updatedAt: new Date(),
      },
    })
    .returning({ id: modelOverrides.id });
  return getOverride(row.id);
}

export async function updateOverride(
  id: number,
  patch: Partial<z.infer<typeof modelOverrideCreateSchema>>,
) {
  const [updated] = await db
    .update(modelOverrides)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(modelOverrides.id, id))
    .returning({ id: modelOverrides.id });
  if (!updated) throw ApiError.notFound("Model override not found");
  return getOverride(id);
}

export async function deleteOverride(id: number) {
  const [deleted] = await db
    .delete(modelOverrides)
    .where(eq(modelOverrides.id, id))
    .returning({ id: modelOverrides.id });
  if (!deleted) throw ApiError.notFound("Model override not found");
  return { id: deleted.id, deleted: true };
}
