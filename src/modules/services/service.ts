import { asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { services } from "../../db/schema/index.js";
import type { ListQuery } from "../../utils/params.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { nextId } from "../../utils/ids.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";

const sortable = {
  id: services.id,
  name: services.name,
  pricePerKg: services.pricePerKg,
  turnaroundHours: services.turnaroundHours,
} as const;

const serialize = (row: typeof services.$inferSelect) => ({
  ...row,
  pricePerKg: toNumber(row.pricePerKg),
});

export async function listServices(query: ListQuery) {
  const where = query.search
    ? or(
        ilike(services.name, `%${query.search}%`),
        ilike(services.description, `%${query.search}%`),
      )
    : undefined;
  const column = sortable[(query.sort ?? "id") as keyof typeof sortable] ?? services.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(services)
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(services).where(where),
  ]);

  return {
    data: rows.map(serialize),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getService(id: string) {
  const [row] = await db.select().from(services).where(eq(services.id, id));
  if (!row) throw ApiError.notFound("Service not found");
  return serialize(row);
}

interface ServiceInput {
  id?: string;
  name?: string;
  description?: string;
  pricePerKg?: number;
  turnaroundHours?: number;
}

export async function createService(
  input: ServiceInput & {
    name: string;
    description: string;
    pricePerKg: number;
    turnaroundHours: number;
  },
) {
  const row = {
    ...input,
    id: input.id ?? (await nextId("services", "id", "SV", 3)),
    pricePerKg: String(input.pricePerKg),
  };
  const [created] = await db.insert(services).values(row).returning();
  return serialize(created);
}

export async function updateService(id: string, patch: ServiceInput) {
  const { pricePerKg, ...rest } = patch;
  const values = {
    ...rest,
    ...(pricePerKg !== undefined ? { pricePerKg: String(pricePerKg) } : {}),
  };
  const [updated] = await db.update(services).set(values).where(eq(services.id, id)).returning();
  if (!updated) throw ApiError.notFound("Service not found");
  return serialize(updated);
}

export async function deleteService(id: string) {
  const [deleted] = await db
    .delete(services)
    .where(eq(services.id, id))
    .returning({ id: services.id });
  if (!deleted) throw ApiError.notFound("Service not found");
  return { id: deleted.id, deleted: true };
}
