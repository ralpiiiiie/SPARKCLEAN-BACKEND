import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches } from "../../db/schema/index.js";
import type { ListQuery } from "../../utils/params.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { nextId } from "../../utils/ids.js";
import { ApiError } from "../../utils/errors.js";

const sortable = {
  id: branches.id,
  name: branches.name,
  city: branches.city,
  manager: branches.manager,
} as const;

/** @param branchScope Managers only ever see their own branch row. */
export async function listBranches(query: ListQuery, branchScope: string | null = null) {
  const search = query.search
    ? or(
        ilike(branches.name, `%${query.search}%`),
        ilike(branches.city, `%${query.search}%`),
        ilike(branches.manager, `%${query.search}%`),
      )
    : undefined;
  const where = branchScope
    ? search
      ? and(eq(branches.id, branchScope), search)
      : eq(branches.id, branchScope)
    : search;
  const column = sortable[(query.sort ?? "id") as keyof typeof sortable] ?? branches.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(branches)
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(branches).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getBranch(id: string, branchScope: string | null = null) {
  if (branchScope && id !== branchScope) throw ApiError.notFound("Branch not found");
  const [row] = await db.select().from(branches).where(eq(branches.id, id));
  if (!row) throw ApiError.notFound("Branch not found");
  return row;
}

export async function createBranch(
  input: Omit<typeof branches.$inferInsert, "id"> & { id?: string },
) {
  const row = {
    ...input,
    id: input.id ?? (await nextId("branches", "id", "BR", 3)),
  };
  const [created] = await db.insert(branches).values(row).returning();
  return created;
}

export async function updateBranch(id: string, patch: Partial<typeof branches.$inferInsert>) {
  const [updated] = await db.update(branches).set(patch).where(eq(branches.id, id)).returning();
  if (!updated) throw ApiError.notFound("Branch not found");
  return updated;
}

export async function deleteBranch(id: string) {
  const [deleted] = await db.delete(branches).where(eq(branches.id, id)).returning({ id: branches.id });
  if (!deleted) throw ApiError.notFound("Branch not found");
  return { id: deleted.id, deleted: true };
}
