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
      branchId: orders.branchId,
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
  branchId: string;
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

/**
 * @param branchScope For a branch manager this is their assigned branch and is
 *   always applied. Admins pass `query.branchId` (or null for all branches).
 */
export async function listOrders(query: OrderQuery, branchScope: string | null = null) {
  const conditions: SQL[] = [];
  if (branchScope) conditions.push(eq(orders.branchId, branchScope));
  else if (query.branchId) conditions.push(eq(orders.branchId, query.branchId));
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

/**
 * Fetch one order. When `branchScope` is set, an order from another branch is
 * reported as 404 so its existence is never disclosed.
 */
export async function getOrder(id: string, branchScope: string | null = null) {
  const [row] = await baseQuery().where(eq(orders.id, id));
  if (!row) throw ApiError.notFound("Order not found");
  if (branchScope && row.branchId !== branchScope) throw ApiError.notFound("Order not found");
  return serialize(row);
}

export async function createOrder(
  input: z.infer<typeof orderCreateSchema>,
  branchScope: string | null = null,
) {
  if (branchScope && input.branchId !== branchScope) {
    throw new ApiError(403, "BRANCH_FORBIDDEN", "You can only create orders for your assigned branch.");
  }
  const id = await nextId("orders", "id", "ORD", 5);
  const [created] = await db
    .insert(orders)
    .values({ ...input, id, amount: String(input.amount) })
    .returning({ id: orders.id });
  return getOrder(created.id, branchScope);
}

export async function updateOrder(
  id: string,
  patch: Partial<z.infer<typeof orderCreateSchema>>,
  branchScope: string | null = null,
) {
  // Ownership check happens before any write.
  await getOrder(id, branchScope);
  if (branchScope && patch.branchId && patch.branchId !== branchScope) {
    throw new ApiError(403, "BRANCH_FORBIDDEN", "You cannot move a record to another branch.");
  }
  const { amount, ...rest } = patch;
  const values = {
    ...rest,
    ...(amount !== undefined ? { amount: String(amount) } : {}),
  };
  const [updated] = await db.update(orders).set(values).where(eq(orders.id, id)).returning({
    id: orders.id,
  });
  if (!updated) throw ApiError.notFound("Order not found");
  return getOrder(id, branchScope);
}

export async function deleteOrder(id: string, branchScope: string | null = null) {
  await getOrder(id, branchScope);
  const [deleted] = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
  if (!deleted) throw ApiError.notFound("Order not found");
  return { id: deleted.id, deleted: true };
}
