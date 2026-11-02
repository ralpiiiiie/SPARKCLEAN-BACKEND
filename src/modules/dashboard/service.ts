import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import { branches, customers, orders, services } from "../../db/schema/index.js";
import { toNumber } from "../../utils/numbers.js";
import type { dashboardQuerySchema } from "./validation.js";

type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MS_DAY = 86_400_000;

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} '${year.slice(2)}`;
}

function dayLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${Number(day)}`;
}

function lastDays(anchor: string, days: number): string[] {
  const end = new Date(`${anchor}T00:00:00.000Z`).getTime();
  const out: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    out.push(new Date(end - index * MS_DAY).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Dashboard aggregates for one branch (or all branches for a global admin).
 *
 * `branchScope` is always resolved on the server: for a branch manager it is
 * their assigned branch and cannot be overridden by query parameters.
 */
export async function dashboardSummary(query: DashboardQuery, branchScope: string | null) {
  const conditions: SQL[] = [];
  if (branchScope) conditions.push(eq(orders.branchId, branchScope));
  if (query.serviceId) conditions.push(eq(orders.serviceId, query.serviceId));
  if (query.dateFrom) conditions.push(gte(orders.orderDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(orders.orderDate, query.dateTo));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, customerCount, recent] = await Promise.all([
    db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        customer: customers.name,
        branchId: orders.branchId,
        branch: branches.name,
        serviceId: orders.serviceId,
        service: services.name,
        amount: orders.amount,
        paymentMethod: orders.paymentMethod,
        status: orders.status,
        orderDate: orders.orderDate,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .innerJoin(branches, eq(orders.branchId, branches.id))
      .innerJoin(services, eq(orders.serviceId, services.id))
      .where(where),
    db
      .select({ id: customers.id })
      .from(customers)
      .where(branchScope ? eq(customers.branchId, branchScope) : undefined),
    db
      .select({
        id: orders.id,
        customer: customers.name,
        branch: branches.name,
        service: services.name,
        amount: orders.amount,
        status: orders.status,
        orderDate: orders.orderDate,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .innerJoin(branches, eq(orders.branchId, branches.id))
      .innerJoin(services, eq(orders.serviceId, services.id))
      .where(where)
      .orderBy(desc(orders.orderDate))
      .limit(8),
  ]);

  const billable = rows.filter((row) => row.status !== "Cancelled");
  const revenue = billable.reduce((sum, row) => sum + toNumber(row.amount), 0);

  const monthly = new Map<string, { orders: number; revenue: number }>();
  for (const order of billable) {
    const key = order.orderDate.slice(0, 7);
    const bucket = monthly.get(key) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += toNumber(order.amount);
    monthly.set(key, bucket);
  }
  const series = [...monthly.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12)
    .map(([key, bucket]) => ({
      key,
      month: monthLabel(key),
      orders: bucket.orders,
      revenue: Math.round(bucket.revenue),
      aov: bucket.orders ? Math.round(bucket.revenue / bucket.orders) : 0,
    }));

  const statusCounts = { Received: 0, Washing: 0, Ready: 0, Delivered: 0, Cancelled: 0 };
  for (const row of rows) statusCounts[row.status] += 1;

  const serviceCounts = new Map<string, { orders: number; revenue: number }>();
  for (const order of billable) {
    const bucket = serviceCounts.get(order.service) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += toNumber(order.amount);
    serviceCounts.set(order.service, bucket);
  }

  const paymentCounts = new Map<string, { orders: number; revenue: number }>();
  for (const order of billable) {
    const bucket = paymentCounts.get(order.paymentMethod) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += toNumber(order.amount);
    paymentCounts.set(order.paymentMethod, bucket);
  }
  const paymentTotal = billable.length;
  const paymentMix = [...paymentCounts.entries()]
    .map(([method, bucket]) => ({
      method,
      orders: bucket.orders,
      revenue: Math.round(bucket.revenue),
      sharePct: paymentTotal ? (bucket.orders / paymentTotal) * 100 : 0,
    }))
    .sort((a, b) => b.orders - a.orders);

  // Last 15 days anchored to the latest recorded order (not the wall clock), so
  // the chart matches the dataset the app is actually showing.
  const anchor = rows.reduce((max, row) => (row.orderDate > max ? row.orderDate : max), "");
  const dailyMap = new Map<string, { orders: number; revenue: number }>();
  for (const order of billable) {
    const key = order.orderDate.slice(0, 10);
    const bucket = dailyMap.get(key) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += toNumber(order.amount);
    dailyMap.set(key, bucket);
  }
  const daily = anchor
    ? lastDays(anchor, 15).map((date) => {
        const bucket = dailyMap.get(date) ?? { orders: 0, revenue: 0 };
        return {
          date,
          label: dayLabel(date),
          orders: bucket.orders,
          revenue: Math.round(bucket.revenue),
        };
      })
    : [];

  const customerTotals = new Map<string, { name: string; orders: number; revenue: number; lastOrderDate: string }>();
  for (const order of billable) {
    const entry = customerTotals.get(order.customerId) ?? {
      name: order.customer,
      orders: 0,
      revenue: 0,
      lastOrderDate: order.orderDate,
    };
    entry.orders += 1;
    entry.revenue += toNumber(order.amount);
    if (order.orderDate > entry.lastOrderDate) entry.lastOrderDate = order.orderDate;
    customerTotals.set(order.customerId, entry);
  }
  const topCustomers = [...customerTotals.values()]
    .map((entry) => ({ ...entry, revenue: Math.round(entry.revenue) }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    .slice(0, 5);

  return {
    filters: {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      branchId: branchScope,
      serviceId: query.serviceId ?? null,
    },
    kpis: {
      orders: billable.length,
      revenue: Math.round(revenue),
      aov: billable.length ? Math.round(revenue / billable.length) : 0,
      activeCustomers: new Set(billable.map((row) => row.customerId)).size,
      totalCustomers: customerCount.length,
      completed: statusCounts.Delivered,
      pending: statusCounts.Received,
      inProgress: statusCounts.Washing + statusCounts.Ready,
      cancelled: statusCounts.Cancelled,
      completionRate: rows.length ? (statusCounts.Delivered / rows.length) * 100 : 0,
    },
    statusBreakdown: statusCounts,
    monthly: series,
    daily,
    serviceMix: [...serviceCounts.entries()]
      .map(([name, bucket]) => ({
        name,
        orders: bucket.orders,
        revenue: Math.round(bucket.revenue),
      }))
      .sort((a, b) => b.orders - a.orders),
    paymentMix,
    topCustomers,
    recentOrders: recent.map((row) => ({
      ...row,
      amount: toNumber(row.amount),
    })),
  };
}
