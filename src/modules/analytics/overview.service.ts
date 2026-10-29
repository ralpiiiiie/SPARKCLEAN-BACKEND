import { asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import {
  branches,
  branchMonthlyDemand,
  customers,
  deliveryCosts,
  orders,
  plants,
  services,
} from "../../db/schema/index.js";
import { buildHistogram, computeDescriptiveStats } from "../../analytics/stats.js";
import { polynomialRegression } from "../../analytics/regression.js";
import {
  forecastBranchWorkloads,
  runBranchForecast,
  type ForecastModelName,
} from "../../analytics/forecast.js";
import { latestDemandByBranch } from "../../analytics/scenario.js";
import {
  compareWithBaseline,
  solveTransportationProblem,
} from "../../analytics/transportation.js";
import { toNumber } from "../../utils/numbers.js";
import { ApiError } from "../../utils/errors.js";
import { activeOverride } from "./forecastData.js";
import { getActiveCostAssumption } from "./costAssumptions.service.js";
import { getSettings } from "../settings/service.js";
import type {
  descriptiveQuerySchema,
  optimizeSchema,
  performanceQuerySchema,
} from "./overview.validation.js";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} '${year.slice(2)}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function statusBreakdown(rows: Array<{ status: string }>) {
  let completed = 0;
  let pending = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const row of rows) {
    switch (row.status) {
      case "Delivered":
        completed += 1;
        break;
      case "Received":
        pending += 1;
        break;
      case "Washing":
      case "Ready":
        inProgress += 1;
        break;
      case "Cancelled":
        cancelled += 1;
        break;
    }
  }
  const total = rows.length;
  return {
    completed,
    pending,
    inProgress,
    cancelled,
    total,
    completionRate: total ? (completed / total) * 100 : 0,
    cancellationRate: total ? (cancelled / total) * 100 : 0,
  };
}

function mixBy<T extends string>(
  rows: Array<Record<T, string>>,
  key: T,
): Array<{ name: string; value: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row[key];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export async function descriptive(query: z.infer<typeof descriptiveQuerySchema>) {
  const [branchRows, serviceRows, customerRows, demandRows, orderRows] = await Promise.all([
    db.select().from(branches).orderBy(asc(branches.name)),
    db.select().from(services).orderBy(asc(services.name)),
    db.select().from(customers),
    db.select().from(branchMonthlyDemand).orderBy(asc(branchMonthlyDemand.monthNo)),
    db.select().from(orders).orderBy(asc(orders.orderDate)),
  ]);

  const scopedDemand = query.branchId
    ? demandRows.filter((row) => row.branchId === query.branchId)
    : demandRows;
  const scopedOrders = query.branchId
    ? orderRows.filter((row) => row.branchId === query.branchId)
    : orderRows;
  const billable = scopedOrders.filter((row) => row.status !== "Cancelled");
  const loads = scopedDemand.map((row) => row.loads);

  const byBranch = branchRows
    .filter((branch) => !query.branchId || branch.id === query.branchId)
    .map((branch) => {
      const history = demandRows
        .filter((row) => row.branchId === branch.id)
        .sort((a, b) => a.monthNo - b.monthNo);
      const values = history.map((row) => row.loads);
      if (values.length === 0) return null;

      const fits = values.length >= 3
        ? ([1, 2, 3] as const).map((degree) => {
            const result = polynomialRegression(
              history.map((row) => row.monthNo),
              values,
              degree,
            );
            return {
              model: result.modelType,
              coefficients: result.coefficients,
              rSquared: result.rSquared,
              fStatistic: result.fStatistic,
              pValue: result.pValue,
              mad: result.mad,
              predictions: result.predictions.map((value) => Math.round(value)),
            };
          })
        : [];
      const best = fits.reduce<(typeof fits)[number] | null>(
        (winner, fit) => (winner === null || fit.rSquared > winner.rSquared ? fit : winner),
        null,
      );

      return {
        branchId: branch.id,
        branch: branch.name,
        records: history.length,
        stats: computeDescriptiveStats(values),
        lastLoads: values[values.length - 1],
        trend: values.length >= 2 ? values[values.length - 1] - values[0] : 0,
        bestFit: best,
        fits,
        history: history.map((row) => ({
          monthNo: row.monthNo,
          monthLabel: row.monthLabel,
          loads: row.loads,
        })),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const monthlyMap = new Map<string, { revenue: number; orders: number }>();
  for (const order of billable) {
    const key = monthKey(order.orderDate);
    const bucket = monthlyMap.get(key) ?? { revenue: 0, orders: 0 };
    bucket.revenue += toNumber(order.amount);
    bucket.orders += 1;
    monthlyMap.set(key, bucket);
  }
  const monthly = [...monthlyMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12)
    .map(([key, bucket]) => ({
      key,
      month: formatMonth(key),
      revenue: Math.round(bucket.revenue),
      orders: bucket.orders,
      aov: bucket.orders ? Math.round(bucket.revenue / bucket.orders) : 0,
    }));

  const repeatCounts = new Map<string, number>();
  for (const order of billable) {
    repeatCounts.set(order.customerId, (repeatCounts.get(order.customerId) ?? 0) + 1);
  }
  const repeatCustomers = [...repeatCounts.values()].filter((count) => count > 1).length;
  const uniqueCustomers = repeatCounts.size;

  return {
    totals: {
      branches: branchRows.length,
      services: serviceRows.length,
      customers: customerRows.length,
      orders: billable.length,
      revenue: Math.round(billable.reduce((sum, row) => sum + toNumber(row.amount), 0)),
      demandLoads: loads.reduce((sum, value) => sum + value, 0),
      demandRecords: scopedDemand.length,
    },
    demand: {
      stats: loads.length ? computeDescriptiveStats(loads) : null,
      histogram: buildHistogram(loads),
      records: scopedDemand.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        monthNo: row.monthNo,
        monthLabel: row.monthLabel,
        loads: row.loads,
      })),
    },
    branches: byBranch,
    monthly,
    status: statusBreakdown(scopedOrders),
    serviceMix: mixBy(
      billable.map((row) => ({
        name: serviceRows.find((service) => service.id === row.serviceId)?.name ?? row.serviceId,
      })),
      "name",
    ),
    paymentMix: mixBy(billable, "paymentMethod"),
    repeat: {
      uniqueCustomers,
      repeatCustomers,
      repeatRate: uniqueCustomers ? (repeatCustomers / uniqueCustomers) * 100 : 0,
      ordersPerCustomer: uniqueCustomers ? billable.length / uniqueCustomers : 0,
    },
  };
}

export async function predictive(branchId?: string) {
  const rows = await db
    .select({
      branchId: branchMonthlyDemand.branchId,
      branchName: branches.name,
      monthNo: branchMonthlyDemand.monthNo,
      loads: branchMonthlyDemand.loads,
    })
    .from(branchMonthlyDemand)
    .innerJoin(branches, eq(branchMonthlyDemand.branchId, branches.id));

  const scoped = branchId ? rows.filter((row) => row.branchId === branchId) : rows;
  const workloads = forecastBranchWorkloads(scoped);

  const branchForecasts = await Promise.all(
    workloads.map(async (workload) => {
      const history = scoped
        .filter((row) => row.branchId === workload.branchId)
        .sort((a, b) => a.monthNo - b.monthNo)
        .map((row) => ({
          monthNo: row.monthNo,
          loads: row.loads,
          monthLabel: `${row.monthNo}`,
        }));
      if (history.length < 6) return null;
      const override = await activeOverride(workload.branchId);
      try {
        const forecast = runBranchForecast({
          history,
          horizon: 3,
          model: override ? (override.chosenModel as ForecastModelName) : "auto",
          override: override
            ? { model: override.chosenModel as ForecastModelName, reason: override.reason }
            : null,
        });
        return {
          branchId: workload.branchId,
          branch: workload.branch,
          model: forecast.model,
          autoModel: forecast.autoModel,
          overridden: forecast.overridden,
          r2: forecast.r2,
          mad: forecast.mad,
          forecast: forecast.forecast,
        };
      } catch {
        return null;
      }
    }),
  );

  return {
    workloads,
    branchForecasts: branchForecasts.filter(
      (row): row is NonNullable<typeof row> => row !== null,
    ),
  };
}

interface RoutingModel {
  plantRows: Array<{ id: string; name: string; monthlyCapacity: number }>;
  branchRows: Array<{ id: string; name: string }>;
  supply: number[];
  demand: number[];
  matrix: number[][];
}

async function currentRoutingModel(): Promise<RoutingModel> {
  const [plantRows, branchRows, demandRows, costRows] = await Promise.all([
    db.select().from(plants).orderBy(asc(plants.name)),
    db.select().from(branches).orderBy(asc(branches.name)),
    db.select().from(branchMonthlyDemand),
    db.select().from(deliveryCosts),
  ]);
  const demandByBranch = latestDemandByBranch(demandRows);
  const costMap = new Map(
    costRows.map((row) => [`${row.plantId}:${row.branchId}`, toNumber(row.costPerLoad)]),
  );

  const supply = plantRows.map((plant) => plant.monthlyCapacity);
  const totalSupply = supply.reduce((sum, value) => sum + value, 0);
  const rawDemand = branchRows.map((branch) => demandByBranch.get(branch.id) ?? 0);
  const totalDemand = rawDemand.reduce((sum, value) => sum + value, 0);
  const demand = rawDemand.map((value) =>
    totalDemand ? Math.round((value / totalDemand) * totalSupply) : 0,
  );
  const diff = totalSupply - demand.reduce((sum, value) => sum + value, 0);
  if (demand.length) demand[demand.length - 1] += diff;

  return {
    plantRows: plantRows.map((row) => ({
      id: row.id,
      name: row.name,
      monthlyCapacity: row.monthlyCapacity,
    })),
    branchRows: branchRows.map((row) => ({ id: row.id, name: row.name })),
    supply,
    demand,
    matrix: plantRows.map((plant) =>
      branchRows.map((branch) =>
        Math.max(0, Math.round(costMap.get(`${plant.id}:${branch.id}`) ?? 10)),
      ),
    ),
  };
}

function solveModel(model: RoutingModel) {
  const solution = solveTransportationProblem({
    supply: model.supply,
    demand: model.demand,
    costs: model.matrix,
  });
  const comparison = compareWithBaseline(solution, model.supply, model.demand, model.matrix);
  const items: Array<{
    plantId: string;
    plant: string;
    branchId: string;
    branch: string;
    loads: number;
    unitCost: number;
    totalCost: number;
  }> = [];
  model.plantRows.forEach((plant, i) => {
    model.branchRows.forEach((branch, j) => {
      const loads = solution.allocations[i][j];
      if (loads > 0) {
        const unitCost = model.matrix[i][j];
        items.push({
          plantId: plant.id,
          plant: plant.name,
          branchId: branch.id,
          branch: branch.name,
          loads,
          unitCost,
          totalCost: loads * unitCost,
        });
      }
    });
  });
  return {
    plants: model.plantRows.map((plant, i) => ({
      id: plant.id,
      name: plant.name,
      supply: model.supply[i],
    })),
    branches: model.branchRows.map((branch, i) => ({
      id: branch.id,
      name: branch.name,
      demand: model.demand[i],
    })),
    costs: model.matrix,
    solution,
    totalCost: solution.totalCost,
    baselineCost: comparison.baselineCost,
    savings: comparison.savings,
    savingsPct: comparison.savingsPercent,
    items,
  };
}

export async function performanceImprovement(
  query: z.infer<typeof performanceQuerySchema>,
) {
  const [assumption, settings] = await Promise.all([
    getActiveCostAssumption(),
    getSettings(),
  ]);
  const rushCost = query.rushCostPerLoad ?? assumption?.rushCostPerLoad ?? settings.rushCostPerLoad;
  const storageCost =
    query.storageCostPerLoad ?? assumption?.storageCostPerLoad ?? settings.storageCostPerLoad;

  const [orderRows, model] = await Promise.all([
    db
      .select({ status: orders.status, loads: orders.loads, branchId: orders.branchId })
      .from(orders),
    currentRoutingModel(),
  ]);

  let rushLoads = 0;
  let storageLoads = 0;
  for (const order of orderRows) {
    if (order.status === "Received") rushLoads += order.loads;
    if (order.status === "Ready") storageLoads += order.loads;
  }

  const plan = solveModel(model);
  const rushCostTotal = rushLoads * rushCost;
  const storageCostTotal = storageLoads * storageCost;

  return {
    assumption: assumption ?? {
      id: 0,
      name: "App settings",
      rushCostPerLoad: settings.rushCostPerLoad,
      storageCostPerLoad: settings.storageCostPerLoad,
      isActive: true,
    },
    rushCostPerLoad: rushCost,
    storageCostPerLoad: storageCost,
    rushLoads,
    storageLoads,
    rushCost: rushCostTotal,
    storageCost: storageCostTotal,
    penaltyCost: rushCostTotal + storageCostTotal,
    routing: {
      optimizedCost: plan.totalCost,
      baselineCost: plan.baselineCost,
      savings: plan.savings,
      savingsPct: plan.savingsPct,
    },
    totalOpportunity: plan.savings - (rushCostTotal + storageCostTotal),
  };
}

export async function optimize(body: z.infer<typeof optimizeSchema>) {
  const base = await currentRoutingModel();
  const plantRows = body.plantIds
    ? base.plantRows.filter((plant) => body.plantIds?.includes(plant.id))
    : base.plantRows;
  const branchRows = body.branchIds
    ? base.branchRows.filter((branch) => body.branchIds?.includes(branch.id))
    : base.branchRows;
  if (plantRows.length === 0 || branchRows.length === 0) {
    throw ApiError.badRequest("At least one plant and one branch are required", "EMPTY_MODEL");
  }

  const capacityFactor = 1 + body.capacityPct / 100;
  const demandFactor = 1 + body.demandPct / 100;
  const fuelFactor = 1 + body.fuelCostPct / 100;

  const supply = plantRows.map((plant) =>
    Math.max(
      0,
      Math.round(
        body.supplyByPlant?.[plant.id] ?? plant.monthlyCapacity * capacityFactor,
      ),
    ),
  );
  const totalSupply = supply.reduce((sum, value) => sum + value, 0);

  const baseDemand = branchRows.map((branch) => {
    const index = base.branchRows.findIndex((row) => row.id === branch.id);
    return body.demandByBranch?.[branch.id] ?? (base.demand[index] ?? 0) * demandFactor;
  });
  const totalDemand = baseDemand.reduce((sum, value) => sum + value, 0);
  const demand = baseDemand.map((value) =>
    totalDemand ? Math.round((value / totalDemand) * totalSupply) : 0,
  );
  const diff = totalSupply - demand.reduce((sum, value) => sum + value, 0);
  if (demand.length) demand[demand.length - 1] += diff;

  const costMap = new Map(
    (body.costs ?? []).map((row) => [`${row.plantId}:${row.branchId}`, row.costPerLoad]),
  );
  const matrix = plantRows.map((plant, i) =>
    branchRows.map((branch, j) => {
      const index = base.branchRows.findIndex((row) => row.id === branch.id);
      return Math.max(
        0,
        Math.round(
          (costMap.get(`${plant.id}:${branch.id}`) ?? base.matrix[i]?.[index] ?? 10) *
            fuelFactor,
        ),
      );
    }),
  );

  return solveModel({
    plantRows: plantRows.map((row) => ({ id: row.id, name: row.name, monthlyCapacity: row.monthlyCapacity })),
    branchRows,
    supply,
    demand,
    matrix,
  });
}

export async function dailyForecast(days = 7) {
  const rows = await db
    .select({ orderDate: orders.orderDate, status: orders.status, amount: orders.amount })
    .from(orders);
  const billable = rows.filter((row) => row.status !== "Cancelled");
  if (billable.length === 0) {
    return { averageOrders: 0, averageRevenue: 0, forecast: [] };
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const recent = billable.filter((row) => row.orderDate >= cutoffKey);
  const base = recent.length ? recent : billable;
  const daysSet = new Set(base.map((row) => row.orderDate));
  const span = Math.max(1, daysSet.size);
  const averageOrders = base.length / span;
  const averageRevenue = base.reduce((sum, row) => sum + toNumber(row.amount), 0) / span;

  const forecast = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    return {
      date: date.toISOString().slice(0, 10),
      orders: Math.round(averageOrders),
      revenue: Math.round(averageRevenue),
    };
  });
  return { averageOrders, averageRevenue, forecast };
}
