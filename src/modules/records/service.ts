import { and, asc, count, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import {
  customers,
  machineUsageLog,
  marketingCampaigns,
  orders,
  payments,
  services,
} from "../../db/schema/index.js";
import { ApiError } from "../../utils/errors.js";
import { nextId } from "../../utils/ids.js";
import { toNumber } from "../../utils/numbers.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import {
  customerCreateSchema,
  customerQuerySchema,
  customerUpdateSchema,
  machineUsageCreateSchema,
  machineUsageQuerySchema,
  machineUsageUpdateSchema,
  marketingCreateSchema,
  marketingQuerySchema,
  marketingUpdateSchema,
  orderCreateSchema,
  orderQuerySchema,
  orderUpdateSchema,
  paymentCreateSchema,
  paymentQuerySchema,
  paymentUpdateSchema,
  serviceCreateSchema,
  serviceQuerySchema,
  serviceUpdateSchema,
} from "./validation.js";

export const MONTHS = [
  "Nov 2025",
  "Dec 2025",
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
] as const;

/** Weeks 1–4 are November, 5–8 December, and so on. */
export function monthForWeek(week: number): string {
  const index = Math.min(11, Math.max(0, Math.floor((week - 1) / 4)));
  return MONTHS[index];
}

function whereOf(conditions: SQL[]) {
  return conditions.length ? and(...conditions) : undefined;
}

function orderBy(column: Parameters<typeof asc>[0], order: "asc" | "desc") {
  return order === "desc" ? desc(column) : asc(column);
}

/* ── Customers ── */

const customerSort = {
  id: customers.id,
  name: customers.name,
  barangay: customers.barangay,
  type: customers.type,
} as const;

export async function listCustomers(query: z.infer<typeof customerQuerySchema>) {
  const conditions = [];
  if (query.barangay) conditions.push(eq(customers.barangay, query.barangay));
  if (query.type) conditions.push(eq(customers.type, query.type));
  if (query.search) {
    conditions.push(
      or(
        ilike(customers.id, `%${query.search}%`),
        ilike(customers.name, `%${query.search}%`),
        ilike(customers.barangay, `%${query.search}%`),
      )!,
    );
  }
  const where = whereOf(conditions);
  const column =
    customerSort[(query.sort ?? "id") as keyof typeof customerSort] ?? customers.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(orderBy(column, query.order))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(customers).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getCustomer(id: string) {
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Customer not found.");
  return row;
}

export async function createCustomer(input: z.infer<typeof customerCreateSchema>) {
  const id = await nextId("customers", "id", "CUS", 3);
  const [created] = await db.insert(customers).values({ ...input, id }).returning();
  return created;
}

export async function updateCustomer(
  id: string,
  input: z.infer<typeof customerUpdateSchema>,
) {
  await getCustomer(id);
  const [updated] = await db
    .update(customers)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  return updated;
}

export async function deleteCustomer(id: string) {
  await getCustomer(id);
  await db.delete(customers).where(eq(customers.id, id));
  return { id, deleted: true };
}

/* ── Services ── */

const serviceSort = {
  id: services.id,
  name: services.name,
  price: services.price,
  cost: services.cost,
  machineHoursPerUnit: services.machineHoursPerUnit,
} as const;

function serializeService(row: typeof services.$inferSelect) {
  return {
    ...row,
    price: toNumber(row.price),
    cost: toNumber(row.cost),
    machineHoursPerUnit: toNumber(row.machineHoursPerUnit),
  };
}

export async function listServices(query: z.infer<typeof serviceQuerySchema>) {
  const conditions = [];
  if (query.search) {
    conditions.push(
      or(
        ilike(services.id, `%${query.search}%`),
        ilike(services.name, `%${query.search}%`),
        ilike(services.unitLabel, `%${query.search}%`),
      )!,
    );
  }
  const where = whereOf(conditions);
  const column =
    serviceSort[(query.sort ?? "id") as keyof typeof serviceSort] ?? services.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(services)
      .where(where)
      .orderBy(orderBy(column, query.order))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(services).where(where),
  ]);

  return {
    data: rows.map(serializeService),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getService(id: string) {
  const [row] = await db.select().from(services).where(eq(services.id, id)).limit(1);
  if (!row) throw ApiError.notFound("Service not found.");
  return serializeService(row);
}

async function assertServiceNameAvailable(name: string, excludeId?: string) {
  const conditions = [sql`lower(${services.name}) = lower(${name})`];
  if (excludeId) conditions.push(ne(services.id, excludeId));
  const [duplicate] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(...conditions))
    .limit(1);
  if (duplicate) {
    throw ApiError.conflict("A service with this name already exists.");
  }
}

export async function createService(input: z.infer<typeof serviceCreateSchema>) {
  await assertServiceNameAvailable(input.name);
  const id = await nextId("services", "id", "SV", 2);
  const [created] = await db
    .insert(services)
    .values({
      id,
      name: input.name,
      unitLabel: input.unitLabel,
      price: String(input.price),
      cost: String(input.cost),
      machineHoursPerUnit: String(input.machineHoursPerUnit),
    })
    .returning();
  return serializeService(created);
}

export async function updateService(
  id: string,
  input: z.infer<typeof serviceUpdateSchema>,
) {
  await getService(id);
  if (input.name) await assertServiceNameAvailable(input.name, id);
  const [updated] = await db
    .update(services)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unitLabel !== undefined ? { unitLabel: input.unitLabel } : {}),
      ...(input.price !== undefined ? { price: String(input.price) } : {}),
      ...(input.cost !== undefined ? { cost: String(input.cost) } : {}),
      ...(input.machineHoursPerUnit !== undefined
        ? { machineHoursPerUnit: String(input.machineHoursPerUnit) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();
  return serializeService(updated);
}

export async function deleteService(id: string) {
  await getService(id);
  const [linked] = await db
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.serviceId, id));
  if (linked.value > 0) {
    throw ApiError.conflict(
      "This service has orders. Delete those orders first.",
    );
  }
  await db.delete(services).where(eq(services.id, id));
  return { id, deleted: true };
}

/* ── Orders ── */

const orderSort = {
  id: orders.id,
  service: services.name,
  week: orders.week,
  month: orders.month,
  units: orders.units,
} as const;

const orderSelection = {
  id: orders.id,
  serviceId: orders.serviceId,
  service: services.name,
  unitLabel: services.unitLabel,
  week: orders.week,
  month: orders.month,
  units: orders.units,
  paymentAmount: payments.amount,
} as const;

function serializeOrder(row: {
  id: string;
  serviceId: string;
  service: string;
  unitLabel: string;
  week: number;
  month: string;
  units: number;
  paymentAmount: string | null;
}) {
  return {
    ...row,
    paymentAmount: row.paymentAmount === null ? null : toNumber(row.paymentAmount),
  };
}

async function assertServiceExists(serviceId: string) {
  const [row] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row) throw ApiError.badRequest("Choose a valid service.");
}

export async function listOrders(query: z.infer<typeof orderQuerySchema>) {
  const conditions = [];
  if (query.serviceId) conditions.push(eq(orders.serviceId, query.serviceId));
  if (query.search) {
    conditions.push(
      or(
        ilike(orders.id, `%${query.search}%`),
        ilike(services.name, `%${query.search}%`),
        ilike(orders.month, `%${query.search}%`),
        ilike(payments.method, `%${query.search}%`),
      )!,
    );
  }
  const where = whereOf(conditions);
  const column = orderSort[(query.sort ?? "id") as keyof typeof orderSort] ?? orders.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select(orderSelection)
      .from(orders)
      .innerJoin(services, eq(orders.serviceId, services.id))
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .where(where)
      .orderBy(orderBy(column, query.order))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db
      .select({ value: count() })
      .from(orders)
      .innerJoin(services, eq(orders.serviceId, services.id))
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .where(where),
  ]);

  return {
    data: rows.map(serializeOrder),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getOrder(id: string) {
  const [row] = await db
    .select(orderSelection)
    .from(orders)
    .innerJoin(services, eq(orders.serviceId, services.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) throw ApiError.notFound("Order not found.");
  return serializeOrder(row);
}

export async function createOrder(input: z.infer<typeof orderCreateSchema>) {
  await assertServiceExists(input.serviceId);
  const id = await nextId("orders", "id", "ORD", 3);
  const [created] = await db
    .insert(orders)
    .values({
      id,
      serviceId: input.serviceId,
      week: input.week,
      month: monthForWeek(input.week),
      units: input.units,
    })
    .returning({ id: orders.id });
  return getOrder(created.id);
}

export async function updateOrder(
  id: string,
  input: z.infer<typeof orderUpdateSchema>,
) {
  const current = await getOrder(id);
  if (input.serviceId) await assertServiceExists(input.serviceId);
  const week = input.week ?? current.week;
  const [updated] = await db
    .update(orders)
    .set({
      ...(input.serviceId !== undefined ? { serviceId: input.serviceId } : {}),
      ...(input.week !== undefined ? { week: input.week } : {}),
      ...(input.units !== undefined ? { units: input.units } : {}),
      ...(input.week !== undefined ? { month: monthForWeek(week) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))
    .returning({ id: orders.id });
  if (!updated) throw ApiError.notFound("Order not found.");
  return getOrder(id);
}

export async function deleteOrder(id: string) {
  await getOrder(id);
  const [linked] = await db
    .select({ value: count() })
    .from(payments)
    .where(eq(payments.orderId, id));
  if (linked.value > 0) {
    throw ApiError.conflict("This order has a payment. Delete the payment first.");
  }
  await db.delete(orders).where(eq(orders.id, id));
  return { id, deleted: true };
}

/* ── Payments ── */

const paymentSort = {
  id: payments.id,
  orderId: payments.orderId,
  service: services.name,
  amount: payments.amount,
  method: payments.method,
  month: payments.month,
} as const;

const paymentSelection = {
  id: payments.id,
  orderId: payments.orderId,
  service: services.name,
  units: orders.units,
  amount: payments.amount,
  method: payments.method,
  month: payments.month,
} as const;

function serializePayment(row: {
  id: string;
  orderId: string;
  service: string;
  units: number;
  amount: string;
  method: string;
  month: string;
}) {
  return { ...row, amount: toNumber(row.amount) };
}

async function orderForPayment(orderId: string) {
  const [row] = await db
    .select({
      id: orders.id,
      units: orders.units,
      month: orders.month,
      price: services.price,
    })
    .from(orders)
    .innerJoin(services, eq(orders.serviceId, services.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) throw ApiError.badRequest("Choose a valid order.");
  return row;
}

async function assertPaymentAvailable(orderId: string, excludeId?: string) {
  const conditions = [eq(payments.orderId, orderId)];
  if (excludeId) conditions.push(ne(payments.id, excludeId));
  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw ApiError.conflict("This order already has a payment. Edit that payment instead.");
  }
}

export async function listPayments(query: z.infer<typeof paymentQuerySchema>) {
  const conditions = [];
  if (query.method) conditions.push(eq(payments.method, query.method));
  if (query.search) {
    conditions.push(
      or(
        ilike(payments.id, `%${query.search}%`),
        ilike(payments.orderId, `%${query.search}%`),
        ilike(services.name, `%${query.search}%`),
        ilike(payments.month, `%${query.search}%`),
        ilike(payments.method, `%${query.search}%`),
      )!,
    );
  }
  const where = whereOf(conditions);
  const column =
    paymentSort[(query.sort ?? "id") as keyof typeof paymentSort] ?? payments.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select(paymentSelection)
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(services, eq(orders.serviceId, services.id))
      .where(where)
      .orderBy(orderBy(column, query.order))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db
      .select({ value: count() })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(services, eq(orders.serviceId, services.id))
      .where(where),
  ]);

  return {
    data: rows.map(serializePayment),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getPayment(id: string) {
  const [row] = await db
    .select(paymentSelection)
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .innerJoin(services, eq(orders.serviceId, services.id))
    .where(eq(payments.id, id))
    .limit(1);
  if (!row) throw ApiError.notFound("Payment not found.");
  return serializePayment(row);
}

export async function createPayment(input: z.infer<typeof paymentCreateSchema>) {
  const order = await orderForPayment(input.orderId);
  await assertPaymentAvailable(input.orderId);
  const id = await nextId("payments", "id", "PAY", 3);
  const [created] = await db
    .insert(payments)
    .values({
      id,
      orderId: order.id,
      amount: String(order.units * toNumber(order.price)),
      method: input.method,
      month: order.month,
    })
    .returning({ id: payments.id });
  return getPayment(created.id);
}

export async function updatePayment(
  id: string,
  input: z.infer<typeof paymentUpdateSchema>,
) {
  const current = await getPayment(id);
  const orderId = input.orderId ?? current.orderId;
  let amount = current.amount;
  let month = current.month;

  if (input.orderId && input.orderId !== current.orderId) {
    const order = await orderForPayment(input.orderId);
    await assertPaymentAvailable(input.orderId, id);
    amount = order.units * toNumber(order.price);
    month = order.month;
  }

  const [updated] = await db
    .update(payments)
    .set({
      orderId,
      amount: String(amount),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.orderId && input.orderId !== current.orderId ? { month } : {}),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, id))
    .returning({ id: payments.id });
  if (!updated) throw ApiError.notFound("Payment not found.");
  return getPayment(id);
}

export async function deletePayment(id: string) {
  await getPayment(id);
  await db.delete(payments).where(eq(payments.id, id));
  return { id, deleted: true };
}

/* ── Machine usage ── */

const machineSort = {
  id: machineUsageLog.id,
  day: machineUsageLog.day,
  hoursAvailable: machineUsageLog.hoursAvailable,
  hoursUsed: machineUsageLog.hoursUsed,
} as const;

function serializeMachine(row: typeof machineUsageLog.$inferSelect) {
  return {
    ...row,
    hoursAvailable: toNumber(row.hoursAvailable),
    hoursUsed: toNumber(row.hoursUsed),
  };
}

export async function listMachineUsage(query: z.infer<typeof machineUsageQuerySchema>) {
  const conditions = [];
  if (query.search) {
    conditions.push(
      or(
        ilike(machineUsageLog.id, `%${query.search}%`),
        sql`cast(${machineUsageLog.day} as text) ilike ${`%${query.search}%`}`,
      )!,
    );
  }
  const where = whereOf(conditions);
  const column =
    machineSort[(query.sort ?? "id") as keyof typeof machineSort] ?? machineUsageLog.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(machineUsageLog)
      .where(where)
      .orderBy(orderBy(column, query.order))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(machineUsageLog).where(where),
  ]);

  return {
    data: rows.map(serializeMachine),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getMachineUsage(id: string) {
  const [row] = await db
    .select()
    .from(machineUsageLog)
    .where(eq(machineUsageLog.id, id))
    .limit(1);
  if (!row) throw ApiError.notFound("Machine usage row not found.");
  return serializeMachine(row);
}

async function assertDayAvailable(day: number, excludeId?: string) {
  const conditions = [eq(machineUsageLog.day, day)];
  if (excludeId) conditions.push(ne(machineUsageLog.id, excludeId));
  const [existing] = await db
    .select({ id: machineUsageLog.id })
    .from(machineUsageLog)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw ApiError.conflict(`A machine usage row for day ${day} already exists.`);
  }
}

export async function createMachineUsage(
  input: z.infer<typeof machineUsageCreateSchema>,
) {
  await assertDayAvailable(input.day);
  const id = await nextId("machine_usage_log", "id", "USG", 3);
  const [created] = await db
    .insert(machineUsageLog)
    .values({
      id,
      day: input.day,
      hoursAvailable: String(input.hoursAvailable),
      hoursUsed: String(input.hoursUsed),
    })
    .returning();
  return serializeMachine(created);
}

export async function updateMachineUsage(
  id: string,
  input: z.infer<typeof machineUsageUpdateSchema>,
) {
  const current = await getMachineUsage(id);
  if (input.day !== undefined) await assertDayAvailable(input.day, id);
  const hoursAvailable = input.hoursAvailable ?? current.hoursAvailable;
  const hoursUsed = input.hoursUsed ?? current.hoursUsed;
  if (hoursUsed > hoursAvailable) {
    throw ApiError.badRequest("Used hours cannot exceed available hours.", {
      hoursUsed: ["Used hours cannot exceed available hours."],
    });
  }
  const [updated] = await db
    .update(machineUsageLog)
    .set({
      ...(input.day !== undefined ? { day: input.day } : {}),
      hoursAvailable: String(hoursAvailable),
      hoursUsed: String(hoursUsed),
      updatedAt: new Date(),
    })
    .where(eq(machineUsageLog.id, id))
    .returning();
  return serializeMachine(updated);
}

export async function deleteMachineUsage(id: string) {
  await getMachineUsage(id);
  await db.delete(machineUsageLog).where(eq(machineUsageLog.id, id));
  return { id, deleted: true };
}

/* ── Marketing ── */

const marketingSort = {
  id: marketingCampaigns.id,
  channel: marketingCampaigns.channel,
  cost: marketingCampaigns.cost,
  leads: marketingCampaigns.leads,
} as const;

function serializeCampaign(row: typeof marketingCampaigns.$inferSelect) {
  return { ...row, cost: toNumber(row.cost) };
}

export async function listMarketing(query: z.infer<typeof marketingQuerySchema>) {
  const conditions = [];
  if (query.channel) conditions.push(eq(marketingCampaigns.channel, query.channel));
  if (query.search) {
    conditions.push(
      or(
        ilike(marketingCampaigns.id, `%${query.search}%`),
        ilike(marketingCampaigns.channel, `%${query.search}%`),
      )!,
    );
  }
  const where = whereOf(conditions);
  const column =
    marketingSort[(query.sort ?? "id") as keyof typeof marketingSort] ??
    marketingCampaigns.id;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(marketingCampaigns)
      .where(where)
      .orderBy(orderBy(column, query.order))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(marketingCampaigns).where(where),
  ]);

  return {
    data: rows.map(serializeCampaign),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getCampaign(id: string) {
  const [row] = await db
    .select()
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.id, id))
    .limit(1);
  if (!row) throw ApiError.notFound("Campaign not found.");
  return serializeCampaign(row);
}

export async function createCampaign(input: z.infer<typeof marketingCreateSchema>) {
  const id = await nextId("marketing_campaigns", "id", "CMP", 3);
  const [created] = await db
    .insert(marketingCampaigns)
    .values({ id, channel: input.channel, cost: String(input.cost), leads: input.leads })
    .returning();
  return serializeCampaign(created);
}

export async function updateCampaign(
  id: string,
  input: z.infer<typeof marketingUpdateSchema>,
) {
  await getCampaign(id);
  const [updated] = await db
    .update(marketingCampaigns)
    .set({
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.cost !== undefined ? { cost: String(input.cost) } : {}),
      ...(input.leads !== undefined ? { leads: input.leads } : {}),
      updatedAt: new Date(),
    })
    .where(eq(marketingCampaigns.id, id))
    .returning();
  return serializeCampaign(updated);
}

export async function deleteCampaign(id: string) {
  await getCampaign(id);
  await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
  return { id, deleted: true };
}
