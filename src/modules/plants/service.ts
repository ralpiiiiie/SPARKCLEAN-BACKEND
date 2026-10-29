import { asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { plants } from "../../db/schema/index.js";
import type { ListQuery } from "../../utils/params.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { nextId } from "../../utils/ids.js";
import { ApiError } from "../../utils/errors.js";

const sortable = {
  id: plants.id,
  name: plants.name,
  city: plants.city,
  monthlyCapacity: plants.monthlyCapacity,
} as const;

export async function listPlants(query: ListQuery) {
  const where = query.search
    ? or(
        ilike(plants.name, `%${query.search}%`),
        ilike(plants.city, `%${query.search}%`),
      )
    : undefined;
  const column = sortable[(query.sort ?? "id") as keyof typeof sortable] ?? plants.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(plants)
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(plants).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getPlant(id: string) {
  const [row] = await db.select().from(plants).where(eq(plants.id, id));
  if (!row) throw ApiError.notFound("Plant not found");
  return row;
}

export async function createPlant(
  input: Omit<typeof plants.$inferInsert, "id"> & { id?: string },
) {
  const row = { ...input, id: input.id ?? (await nextId("plants", "id", "PL", 3)) };
  const [created] = await db.insert(plants).values(row).returning();
  return created;
}

export async function updatePlant(id: string, patch: Partial<typeof plants.$inferInsert>) {
  const [updated] = await db.update(plants).set(patch).where(eq(plants.id, id)).returning();
  if (!updated) throw ApiError.notFound("Plant not found");
  return updated;
}

export async function deletePlant(id: string) {
  const [deleted] = await db.delete(plants).where(eq(plants.id, id)).returning({ id: plants.id });
  if (!deleted) throw ApiError.notFound("Plant not found");
  return { id: deleted.id, deleted: true };
}
