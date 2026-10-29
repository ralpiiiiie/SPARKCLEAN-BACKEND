import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { savedViews } from "../../db/schema/index.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import type {
  savedViewCreateSchema,
  savedViewQuerySchema,
} from "./savedViews.validation.js";

type ViewQuery = z.infer<typeof savedViewQuerySchema>;

export async function listSavedViews(query: ViewQuery) {
  const conditions: SQL[] = [];
  if (query.pageName) conditions.push(eq(savedViews.page, query.pageName));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(savedViews)
      .where(where)
      .orderBy(desc(savedViews.isDefault), asc(savedViews.name))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(savedViews).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getSavedView(id: number) {
  const [row] = await db.select().from(savedViews).where(eq(savedViews.id, id));
  if (!row) throw ApiError.notFound("Saved view not found");
  return row;
}

export async function createSavedView(input: z.infer<typeof savedViewCreateSchema>) {
  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(savedViews)
        .set({ isDefault: false })
        .where(eq(savedViews.page, input.page));
    }
    const [created] = await tx.insert(savedViews).values(input).returning();
    return created;
  });
}

export async function updateSavedView(
  id: number,
  patch: Partial<z.infer<typeof savedViewCreateSchema>>,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(savedViews).where(eq(savedViews.id, id));
    if (!existing) throw ApiError.notFound("Saved view not found");
    const page = patch.page ?? existing.page;
    if (patch.isDefault) {
      await tx.update(savedViews).set({ isDefault: false }).where(eq(savedViews.page, page));
    }
    const [updated] = await tx
      .update(savedViews)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(savedViews.id, id))
      .returning();
    return updated;
  });
}

export async function deleteSavedView(id: number) {
  const [deleted] = await db
    .delete(savedViews)
    .where(eq(savedViews.id, id))
    .returning({ id: savedViews.id });
  if (!deleted) throw ApiError.notFound("Saved view not found");
  return { id: deleted.id, deleted: true };
}
