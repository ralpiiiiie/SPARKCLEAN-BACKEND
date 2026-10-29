import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
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

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} '${year.slice(2)}`;
}

export async function dashboardSummary(query: DashboardQuery) {
  const conditions: SQL[] = [];
  if (query.branchId) conditions.push(eq(orders.branchId, query.branchId));
  if (query.serviceId) conditions.push(eq(orders.serviceId, query.serviceId));
  if (query.dateFrom) conditions.push(gte(orders.orderDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(orders.orderDate, query.dateTo));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, customerCount, recent] = await Promise.all([
    db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        branch: branches.name,
        serviceId: orders.serviceId,
        service: services.name,
        amount: orders.amount,
        status: orders.status,
        orderDate: orders.orderDate,
      })
      .from(orders)
      .innerJoin(branches, eq(orders.branchId, branches.id))
      .innerJoin(services, eq(orders.serviceId, services.id))
      .where(where),
    db.select({ id: customers.id }).from(customers),
    db
      .select({
        id: orders.id,
        branch: branches.name,
        service: services.name,
        amount: orders.amount,
        status: orders.status,
        orderDate: orders.orderDate,
      })
      .from(orders)
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

  return {
    filters: {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      branchId: query.branchId ?? null,
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
    serviceMix: [...serviceCounts.entries()]
      .map(([name, bucket]) => ({
        name,
        orders: bucket.orders,
        revenue: Math.round(bucket.revenue),
      }))
      .sort((a, b) => b.orders - a.orders),
    recentOrders: recent.map((row) => ({
      ...row,
      amount: toNumber(row.amount),
    })),
  };
}
