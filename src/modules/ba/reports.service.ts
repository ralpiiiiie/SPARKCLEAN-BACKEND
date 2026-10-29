import { and, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import {
  baRecommendations,
  baReports,
  branchMonthlyDemand,
  branches,
  customers,
  optimizationScenarios,
  orders,
  plants,
  services,
} from "../../db/schema/index.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";
import { getSettings } from "../settings/service.js";
import { getActiveCostAssumption } from "../analytics/costAssumptions.service.js";
import { runBranchForecast } from "../../analytics/forecast.js";
import type {
  reportCreateSchema,
  reportQuerySchema,
  snapshotCreateSchema,
} from "./reports.validation.js";

type ReportQuery = z.infer<typeof reportQuerySchema>;
type ReportCreate = z.infer<typeof reportCreateSchema>;
type SnapshotInput = z.infer<typeof snapshotCreateSchema>;

export async function listReports(query: ReportQuery) {
  const conditions: SQL[] = [];
  if (query.search) conditions.push(ilike(baReports.title, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(baReports)
      .where(where)
      .orderBy(desc(baReports.createdAt))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(baReports).where(where),
  ]);
  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getReport(id: number) {
  const [row] = await db.select().from(baReports).where(eq(baReports.id, id));
  if (!row) throw ApiError.notFound("Report not found");
  return row;
}

export async function createReport(input: ReportCreate) {
  const [created] = await db
    .insert(baReports)
    .values(input)
    .returning({ id: baReports.id });
  return getReport(created.id);
}

export async function updateReport(id: number, title: string) {
  const [updated] = await db
    .update(baReports)
    .set({ title })
    .where(eq(baReports.id, id))
    .returning({ id: baReports.id });
  if (!updated) throw ApiError.notFound("Report not found");
  return getReport(id);
}

export async function deleteReport(id: number) {
  const [deleted] = await db
    .delete(baReports)
    .where(eq(baReports.id, id))
    .returning({ id: baReports.id });
  if (!deleted) throw ApiError.notFound("Report not found");
  return { id: deleted.id, deleted: true };
}

export async function createSnapshot(input: SnapshotInput) {
  const conditions: SQL[] = [];
  if (input.branchId) conditions.push(eq(orders.branchId, input.branchId));
  if (input.dateFrom) conditions.push(gte(orders.orderDate, input.dateFrom));
  if (input.dateTo) conditions.push(lte(orders.orderDate, input.dateTo));
  const where = conditions.length ? and(...conditions) : undefined;

  const [
    orderRows,
    serviceRows,
    demandRows,
    scenarioRows,
    recommendationRows,
    branchRows,
    plantRows,
    customerRows,
    settings,
    assumption,
  ] = await Promise.all([
    db.select().from(orders).where(where),
    db.select().from(services),
    db.select().from(branchMonthlyDemand),
    db.select().from(optimizationScenarios),
    db.select().from(baRecommendations),
    db.select().from(branches).orderBy(branches.name),
    db.select().from(plants),
    db.select().from(customers),
    getSettings(),
    getActiveCostAssumption(),
  ]);

  const billable = orderRows.filter((row) => row.status !== "Cancelled");
  const revenue = billable.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const serviceNames = new Map(serviceRows.map((row) => [row.id, row.name]));
  const serviceCounts = new Map<string, { orders: number; revenue: number }>();
  for (const order of billable) {
    const name = serviceNames.get(order.serviceId) ?? order.serviceId;
    const bucket = serviceCounts.get(name) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += toNumber(order.amount);
    serviceCounts.set(name, bucket);
  }

  const monthly = new Map<string, { orders: number; revenue: number }>();
  for (const order of billable) {
    const key = order.orderDate.slice(0, 7);
    const bucket = monthly.get(key) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += toNumber(order.amount);
    monthly.set(key, bucket);
  }

  const scopedDemand = input.branchId
    ? demandRows.filter((row) => row.branchId === input.branchId)
    : demandRows;

  const savedScenarios = scenarioRows.filter((row) => row.totalCost !== null);
  const latestSolved = [...savedScenarios].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  )[0];

  const models = branchRows.map((branch) => {
    const history = demandRows
      .filter((row) => row.branchId === branch.id)
      .sort((a, b) => a.monthNo - b.monthNo);
    if (history.length < 6) {
      return { branch: branch.name, model: null, r2: null, mad: null };
    }
    const forecast = runBranchForecast({
      history,
      horizon: 3,
      validationMonths: 3,
      model: "auto",
    });
    return {
      branch: branch.name,
      model: forecast.model,
      r2: forecast.r2,
      mad: forecast.mad,
    };
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    filters: {
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      branchId: input.branchId ?? null,
    },
    descriptive: {
      orders: billable.length,
      revenue: Math.round(revenue),
      customers: input.branchId
        ? customerRows.filter((row) => row.branchId === input.branchId).length
        : customerRows.length,
      branches: new Set(billable.map((row) => row.branchId)).size,
      plants: plantRows.length,
    },
    models,
    kpis: {
      orders: billable.length,
      revenue: Math.round(revenue),
      aov: billable.length ? Math.round(revenue / billable.length) : 0,
      activeCustomers: new Set(billable.map((row) => row.customerId)).size,
      cancelled: orderRows.length - billable.length,
      completionRate: orderRows.length
        ? (orderRows.filter((row) => row.status === "Delivered").length / orderRows.length) * 100
        : 0,
    },
    monthly: [...monthly.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, bucket]) => ({
        month: key,
        orders: bucket.orders,
        revenue: Math.round(bucket.revenue),
      })),
    demand: {
      records: scopedDemand.length,
      loads: scopedDemand.reduce((sum, row) => sum + row.loads, 0),
    },
    topServices: [...serviceCounts.entries()]
      .map(([name, bucket]) => ({
        service: name,
        orders: bucket.orders,
        revenue: Math.round(bucket.revenue),
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 6),
    optimization: {
      scenario: latestSolved?.name ?? null,
      savings: latestSolved ? Math.round(toNumber(latestSolved.savingsAmount ?? "0")) : 0,
      scenarios: scenarioRows.length,
      solvedScenarios: savedScenarios.length,
      totalSavings: Math.round(
        savedScenarios.reduce((sum, row) => sum + toNumber(row.savingsAmount ?? "0"), 0),
      ),
      activeCostAssumption: assumption?.name ?? null,
    },
    recommendations: {
      open: recommendationRows.filter((row) => row.status === "Open").length,
      inProgress: recommendationRows.filter((row) => row.status === "In progress").length,
      done: recommendationRows.filter((row) => row.status === "Done").length,
    },
    settings,
  };

  const defaultTitle = `BA snapshot ${new Date().toISOString().slice(0, 10)}`;
  return createReport({
    title: input.title ?? defaultTitle,
    snapshotJson: snapshot as unknown as Record<string, unknown>,
  });
}
