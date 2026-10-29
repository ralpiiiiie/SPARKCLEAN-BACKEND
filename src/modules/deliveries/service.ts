import { and, asc, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, plantDeliveries, plants } from "../../db/schema/index.js";
import type { z } from "zod";
import { offsetOf, pageMeta } from "../../utils/params.js";
import type { deliveryCreateSchema, deliveryQuerySchema } from "./validation.js";
import { ApiError } from "../../utils/errors.js";
import { nextId } from "../../utils/ids.js";
import { toNumber } from "../../utils/numbers.js";

type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;

const sortable = {
  id: plantDeliveries.id,
  plant: plants.name,
  branch: branches.name,
  date: plantDeliveries.date,
  loads: plantDeliveries.loads,
  cost: plantDeliveries.cost,
  status: plantDeliveries.status,
} as const;

const baseQuery = () =>
  db
    .select({
      id: plantDeliveries.id,
      plant: plants.name,
      plantId: plantDeliveries.plantId,
      branch: branches.name,
      branchId: plantDeliveries.branchId,
      date: plantDeliveries.date,
      loads: plantDeliveries.loads,
      cost: plantDeliveries.cost,
      status: plantDeliveries.status,
    })
    .from(plantDeliveries)
    .innerJoin(plants, eq(plantDeliveries.plantId, plants.id))
    .innerJoin(branches, eq(plantDeliveries.branchId, branches.id));

type DeliveryRow = Awaited<ReturnType<typeof baseQuery>>[number];

const serialize = (row: DeliveryRow) => ({ ...row, cost: toNumber(row.cost) });

export async function listDeliveries(query: DeliveryQuery) {
  const conditions: SQL[] = [];
  if (query.plantId) conditions.push(eq(plantDeliveries.plantId, query.plantId));
  if (query.branchId) conditions.push(eq(plantDeliveries.branchId, query.branchId));
  if (query.status) conditions.push(eq(plantDeliveries.status, query.status));
  if (query.dateFrom) conditions.push(gte(plantDeliveries.date, query.dateFrom));
  if (query.dateTo) conditions.push(lte(plantDeliveries.date, query.dateTo));
  if (query.search) conditions.push(ilike(plantDeliveries.id, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const column =
    sortable[(query.sort ?? "date") as keyof typeof sortable] ?? plantDeliveries.date;

  const [rows, totalRows] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(plantDeliveries).where(where),
  ]);

  return {
    data: rows.map(serialize),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getDelivery(id: string) {
  const [row] = await baseQuery().where(eq(plantDeliveries.id, id));
  if (!row) throw ApiError.notFound("Delivery not found");
  return serialize(row);
}

export async function createDelivery(input: z.infer<typeof deliveryCreateSchema>) {
  const id = await nextId("plant_deliveries", "id", "DEL", 4);
  const [created] = await db
    .insert(plantDeliveries)
    .values({ ...input, id, cost: String(input.cost) })
    .returning({ id: plantDeliveries.id });
  return getDelivery(created.id);
}

export async function updateDelivery(
  id: string,
  patch: Partial<z.infer<typeof deliveryCreateSchema>>,
) {
  const { cost, ...rest } = patch;
  const values = {
    ...rest,
    ...(cost !== undefined ? { cost: String(cost) } : {}),
  };
  const [updated] = await db
    .update(plantDeliveries)
    .set(values)
    .where(eq(plantDeliveries.id, id))
    .returning({ id: plantDeliveries.id });
  if (!updated) throw ApiError.notFound("Delivery not found");
  return getDelivery(id);
}

export async function deleteDelivery(id: string) {
  const [deleted] = await db
    .delete(plantDeliveries)
    .where(eq(plantDeliveries.id, id))
    .returning({ id: plantDeliveries.id });
  if (!deleted) throw ApiError.notFound("Delivery not found");
  return { id: deleted.id, deleted: true };
}
