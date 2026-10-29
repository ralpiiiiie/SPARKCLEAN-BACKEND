import { and, asc, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, orders } from "../../db/schema/index.js";
import type { z } from "zod";
import { offsetOf, pageMeta } from "../../utils/params.js";
import type { orderCreateSchema, orderQuerySchema } from "./validation.js";
import { ApiError } from "../../utils/errors.js";
import { nextId } from "../../utils/ids.js";
import { toNumber } from "../../utils/numbers.js";

type OrderQuery = z.infer<typeof orderQuerySchema>;

const sortable = {
  id: orders.id,
  branch: branches.name,
  amount: orders.amount,
  orderDate: orders.orderDate,
  status: orders.status,
  kg: orders.kg,
  loads: orders.loads,
} as const;

const baseQuery = () =>
  db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      branch: branches.name,
      serviceId: orders.serviceId,
      kg: orders.kg,
      loads: orders.loads,
      amount: orders.amount,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      orderDate: orders.orderDate,
      isPickup: orders.isPickup,
    })
    .from(orders)
    .innerJoin(branches, eq(orders.branchId, branches.id));

const serialize = (row: {
  id: string;
  customerId: string;
  branch: string;
  serviceId: string;
  kg: number;
  loads: number;
  amount: string;
  paymentMethod: string;
  status: string;
  orderDate: string;
  isPickup: boolean;
}) => ({ ...row, amount: toNumber(row.amount) });

export async function listOrders(query: OrderQuery) {
  const conditions: SQL[] = [];
  if (query.branchId) conditions.push(eq(orders.branchId, query.branchId));
  if (query.serviceId) conditions.push(eq(orders.serviceId, query.serviceId));
  if (query.customerId) conditions.push(eq(orders.customerId, query.customerId));
  if (query.status) conditions.push(eq(orders.status, query.status));
  if (query.paymentMethod) conditions.push(eq(orders.paymentMethod, query.paymentMethod));
  if (query.dateFrom) conditions.push(gte(orders.orderDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(orders.orderDate, query.dateTo));
  if (query.search) {
    conditions.push(
      or(
        ilike(orders.id, `%${query.search}%`),
        ilike(orders.customerId, `%${query.search}%`),
        ilike(branches.name, `%${query.search}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const column = sortable[(query.sort ?? "orderDate") as keyof typeof sortable] ?? orders.orderDate;

  const [rows, totalRows] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(orders).where(where),
  ]);

  return {
    data: rows.map(serialize),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getOrder(id: string) {
  const [row] = await baseQuery().where(eq(orders.id, id));
  if (!row) throw ApiError.notFound("Order not found");
  return serialize(row);
}

export async function createOrder(input: z.infer<typeof orderCreateSchema>) {
  const id = await nextId("orders", "id", "ORD", 5);
  const [created] = await db
    .insert(orders)
    .values({ ...input, id, amount: String(input.amount) })
    .returning({ id: orders.id });
  return getOrder(created.id);
}

export async function updateOrder(
  id: string,
  patch: Partial<z.infer<typeof orderCreateSchema>>,
) {
  const { amount, ...rest } = patch;
  const values = {
    ...rest,
    ...(amount !== undefined ? { amount: String(amount) } : {}),
  };
  const [updated] = await db.update(orders).set(values).where(eq(orders.id, id)).returning({
    id: orders.id,
  });
  if (!updated) throw ApiError.notFound("Order not found");
  return getOrder(id);
}

export async function deleteOrder(id: string) {
  const [deleted] = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
  if (!deleted) throw ApiError.notFound("Order not found");
  return { id: deleted.id, deleted: true };
}
