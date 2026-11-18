import { count, desc, eq } from "drizzle-orm";
import {
  DAYS15_SCALE,
  MODEL_LABELS,
  buildForecastPayload,
  type ForecastHorizonId,
  type ForecastParams,
  type ForecastPayload,
} from "../../analytics/forecast.js";
import { db } from "../../db/client.js";
import {
  customers,
  orders,
  payments,
  services,
} from "../../db/schema/index.js";
import { round2, toNumber } from "../../utils/numbers.js";
import { MONTHS, monthForWeek } from "../records/service.js";
import type { DescriptiveQuery } from "./validation.js";

/** The single forecast month every model predicts into. */
const NEXT_MONTH = "Nov 2026";

/** Recorded weeks: 12 months x 4 weeks. */
const WEEKS = Array.from({ length: 48 }, (_, index) => index + 1);

/** Labels for the recorded weeks, plus the week the short horizons forecast. */
const WEEK_LABELS = WEEKS.map((week) => `W${week}`);
const NEXT_WEEK = "W49";

/** Axis label for the 15-day forecast column, scaled from the weekly series. */
const NEXT_DAYS15 = "15 days";

/** A 15-day point is a weekly point rescaled; a week or a month is itself. */
const horizonScale = (horizon: ForecastHorizonId) => (horizon === "days15" ? DAYS15_SCALE : 1);

interface ServiceRow {
  id: string;
  name: string;
  unitLabel: string;
  price: string;
  cost: string;
  machineHoursPerUnit: string;
}

interface OrderRow {
  orderId: string;
  serviceId: string;
  week: number;
  month: string;
  units: number;
  price: string;
  cost: string;
  hours: string;
  paymentAmount: string | null;
  method: "Cash" | "GCash" | "Maya" | null;
}

const monthIndex = new Map<string, number>(MONTHS.map((label, index) => [label, index]));

async function loadOrders(): Promise<OrderRow[]> {
  return db
    .select({
      orderId: orders.id,
      serviceId: orders.serviceId,
      week: orders.week,
      month: orders.month,
      units: orders.units,
      price: services.price,
      cost: services.cost,
      hours: services.machineHoursPerUnit,
      paymentAmount: payments.amount,
      method: payments.method,
    })
    .from(orders)
    .innerJoin(services, eq(orders.serviceId, services.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .orderBy(orders.week);
}

async function loadServices(): Promise<ServiceRow[]> {
  return db.select().from(services).orderBy(services.id);
}

function economics(row: ServiceRow) {
  const price = toNumber(row.price);
  const cost = toNumber(row.cost);
  const hours = toNumber(row.machineHoursPerUnit);
  const profitPerUnit = price - cost;
  return {
    price,
    cost,
    hoursPerUnit: hours,
    profitPerUnit,
    profitPerHour: hours > 0 ? profitPerUnit / hours : 0,
  };
}

/** Monthly unit totals (12 buckets) for one service. */
function monthlyTotals(rows: OrderRow[], serviceId: string): number[] {
  const totals = new Array(12).fill(0) as number[];
  for (const row of rows) {
    if (row.serviceId !== serviceId) continue;
    const index = monthIndex.get(row.month);
    if (index !== undefined) totals[index] += row.units;
  }
  return totals;
}

/** Weekly unit totals (48 buckets) for one service. */
function weeklyTotals(rows: OrderRow[], serviceId: string): number[] {
  const totals = new Array(48).fill(0) as number[];
  for (const row of rows) {
    if (row.serviceId !== serviceId) continue;
    if (row.week >= 1 && row.week <= 48) totals[row.week - 1] += row.units;
  }
  return totals;
}

/** Services with their recorded totals and per-unit economics. */
async function demandSeries() {
  const [serviceRows, orderRows] = await Promise.all([loadServices(), loadOrders()]);
  return serviceRows.map((row) => ({
    id: row.id,
    name: row.name,
    unitLabel: row.unitLabel,
    monthly: monthlyTotals(orderRows, row.id),
    weekly: weeklyTotals(orderRows, row.id),
    ...economics(row),
  }));
}

/** The series the models are fitted on, for the requested horizon. */
function horizonInput(
  series: Awaited<ReturnType<typeof demandSeries>>,
  horizon: ForecastHorizonId,
) {
  const scale = horizonScale(horizon);
  const source = horizon === "month" ? "monthly" : "weekly";
  return series.map((row) => ({
    id: row.id,
    name: row.name,
    unitLabel: row.unitLabel,
    points: row[source].map((units) => units * scale),
  }));
}

function horizonLabels(horizon: ForecastHorizonId): { periods: string[]; nextPeriod: string } {
  if (horizon === "week") return { periods: [...WEEK_LABELS], nextPeriod: NEXT_WEEK };
  if (horizon === "days15") return { periods: [...WEEK_LABELS], nextPeriod: NEXT_DAYS15 };
  return { periods: [...MONTHS], nextPeriod: NEXT_MONTH };
}

/**
 * Forecast payload for one horizon. The shorter horizons are fitted on the
 * weekly series, so the monthly numbers the Prescriptive page leans on are
 * computed alongside and carried through as `monthForecast`.
 */
function forecastPayload(
  series: Awaited<ReturnType<typeof demandSeries>>,
  params: ForecastParams,
  horizon: ForecastHorizonId,
): ForecastPayload {
  const { periods, nextPeriod } = horizonLabels(horizon);
  const options =
    horizon === "month"
      ? { horizon }
      : {
          horizon,
          monthForecasts: Object.fromEntries(
            forecastPayload(series, params, "month").services.map((row) => [row.id, row.forecast]),
          ),
        };
  return buildForecastPayload(horizonInput(series, horizon), periods, nextPeriod, params, options);
}

/* ── Descriptive ── */

export async function descriptive({ granularity }: DescriptiveQuery = { granularity: "month" }) {
  const [serviceRows, orderRows, customerCount] = await Promise.all([
    loadServices(),
    loadOrders(),
    db.select({ value: count() }).from(customers),
  ]);

  const salesByMonth = new Map<string, number>();
  const profitByMonth = new Map<string, number>();
  const salesByWeek = new Map<number, number>();
  const profitByWeek = new Map<number, number>();
  let totalSales = 0;
  let totalProfit = 0;

  for (const row of orderRows) {
    if (row.paymentAmount === null) continue;
    const amount = toNumber(row.paymentAmount);
    const profit = amount - row.units * toNumber(row.cost);
    totalSales += amount;
    totalProfit += profit;
    salesByMonth.set(row.month, (salesByMonth.get(row.month) ?? 0) + amount);
    profitByMonth.set(row.month, (profitByMonth.get(row.month) ?? 0) + profit);
    salesByWeek.set(row.week, (salesByWeek.get(row.week) ?? 0) + amount);
    profitByWeek.set(row.week, (profitByWeek.get(row.week) ?? 0) + profit);
  }

  const monthlySales = MONTHS.map((month) => ({
    month,
    sales: round2(salesByMonth.get(month) ?? 0),
    profit: round2(profitByMonth.get(month) ?? 0),
  }));

  /** Sales and profit at the requested granularity — the chart series. */
  const salesSeries =
    granularity === "week"
      ? WEEKS.map((week) => ({
          label: `W${week}`,
          period: monthForWeek(week),
          sales: round2(salesByWeek.get(week) ?? 0),
          profit: round2(profitByWeek.get(week) ?? 0),
        }))
      : MONTHS.map((month) => ({
          label: month,
          period: month,
          sales: round2(salesByMonth.get(month) ?? 0),
          profit: round2(profitByMonth.get(month) ?? 0),
        }));

  const unitsByService = new Map<string, number>();
  for (const row of orderRows) {
    unitsByService.set(row.serviceId, (unitsByService.get(row.serviceId) ?? 0) + row.units);
  }

  const profitByService = serviceRows
    .map((row) => {
      const { profitPerHour, ...economy } = economics(row);
      return {
        id: row.id,
        name: row.name,
        unitLabel: row.unitLabel,
        ...economy,
        // Rounded here so the API and the browser mock return identical
        // descriptive payloads; ranking is unaffected at two decimals.
        profitPerHour: round2(profitPerHour),
        unitsProcessed: unitsByService.get(row.id) ?? 0,
      };
    })
    .sort((a, b) => b.profitPerHour - a.profitPerHour);

  const highest = profitByService[0] ?? null;
  const lowest = profitByService[profitByService.length - 1] ?? null;

  return {
    kpis: {
      totalSales: round2(totalSales),
      totalProfit: round2(totalProfit),
      orderRecords: orderRows.length,
      customers: customerCount[0]?.value ?? 0,
    },
    monthlySales,
    granularity,
    salesSeries,
    profitByService,
    finding: {
      highest: highest
        ? { name: highest.name, profitPerHour: round2(highest.profitPerHour) }
        : null,
      lowest: lowest
        ? { name: lowest.name, profitPerHour: round2(lowest.profitPerHour) }
        : null,
      message:
        highest && lowest
          ? `${highest.name} earns ₱${round2(highest.profitPerHour).toFixed(2)} per machine hour; ${lowest.name} earns the least at ₱${round2(lowest.profitPerHour).toFixed(2)}.`
          : "Add services and orders to see the profit ranking.",
    },
  };
}

/* ── Predictive ── */

export async function forecast(params: ForecastParams & { horizon: ForecastHorizonId }) {
  const series = await demandSeries();
  return forecastPayload(series, params, params.horizon);
}

/** Demand ceiling for next month: the selected model's forecast per service. */
async function demandWithForecast(params: ForecastParams) {
  const series = await demandSeries();
  const payload = forecastPayload(series, params, "month");
  const forecastById = new Map(payload.services.map((row) => [row.id, row.forecast]));
  return {
    payload,
    demand: series.map((row) => ({ ...row, forecast: forecastById.get(row.id) ?? 0 })),
  };
}

type DemandRow = {
  id: string;
  name: string;
  unitLabel: string;
  forecast: number;
  profitPerUnit: number;
  hoursPerUnit: number;
  profitPerHour: number;
};

/** Walk the service list in order, spending hours as each plan decides. */
function buildPlanRows(
  demand: DemandRow[],
  startHours: number,
  unitsFor: (row: DemandRow, hoursLeft: number) => number,
) {
  let hoursLeft = Math.max(0, startHours);
  return demand.map((row, index) => {
    const units = Math.max(0, unitsFor(row, hoursLeft));
    const hoursUsed = round2(units * row.hoursPerUnit);
    hoursLeft = Math.max(0, round2(hoursLeft - hoursUsed));
    return {
      rank: index + 1,
      serviceId: row.id,
      service: row.name,
      unitLabel: row.unitLabel,
      forecast: row.forecast,
      units,
      hoursUsed,
      hoursLeft,
      profit: round2(units * row.profitPerUnit),
      profitPerUnit: round2(row.profitPerUnit),
      hoursPerUnit: row.hoursPerUnit,
      profitPerHour: round2(row.profitPerHour),
    };
  });
}

function statusFor(row: { forecast: number; units: number }) {
  if (row.forecast > 0 && row.units >= row.forecast) return "full" as const;
  if (row.units > 0) return "partial" as const;
  return "skipped" as const;
}

/* ── Prescriptive ── */

export async function optimizePlan(input: { hoursAvailable: number; params: ForecastParams }) {
  const { payload, demand } = await demandWithForecast(input.params);
  const available = Math.max(0, input.hoursAvailable);

  const hoursNeededAll = round2(
    demand.reduce((sum, row) => sum + row.forecast * row.hoursPerUnit, 0),
  );
  const share = hoursNeededAll > 0 ? Math.min(1, available / hoursNeededAll) : 0;

  // Current way of working: a little of everything, the same share of each forecast.
  const currentRows = buildPlanRows(demand, available, (row) => Math.floor(row.forecast * share));
  const currentProfit = round2(currentRows.reduce((sum, row) => sum + row.profit, 0));

  // Optimised plan: greedy by profit per machine hour, capped by forecast demand.
  const ranked = [...demand].sort((a, b) => b.profitPerHour - a.profitPerHour);
  const optimizedRows = buildPlanRows(ranked, available, (row, hoursLeft) =>
    row.hoursPerUnit > 0
      ? Math.min(row.forecast, Math.floor(hoursLeft / row.hoursPerUnit))
      : row.forecast,
  );
  const optimizedProfit = round2(optimizedRows.reduce((sum, row) => sum + row.profit, 0));

  const gainPesos = round2(optimizedProfit - currentProfit);
  const gainPct = currentProfit > 0 ? round2((gainPesos / currentProfit) * 100) : 0;

  const currentPlan = {
    percent: round2(share * 100),
    totalProfit: currentProfit,
    hoursUsed: round2(currentRows.reduce((sum, row) => sum + row.hoursUsed, 0)),
    units: currentRows.reduce((sum, row) => sum + row.units, 0),
    rows: currentRows.map((row) => ({ ...row, status: statusFor(row) })),
  };

  const optimizedPlan = {
    totalProfit: optimizedProfit,
    hoursUsed: round2(optimizedRows.reduce((sum, row) => sum + row.hoursUsed, 0)),
    units: optimizedRows.reduce((sum, row) => sum + row.units, 0),
    rows: optimizedRows.map((row) => ({ ...row, status: statusFor(row) })),
  };

  const fullyServed = optimizedPlan.rows.filter((row) => row.status === "full");
  const partial = optimizedPlan.rows.find((row) => row.status === "partial");
  const skipped = optimizedPlan.rows.filter((row) => row.status === "skipped");

  const peso = (value: number) => `₱${Math.round(value).toLocaleString("en-PH")}`;
  const hours = (value: number) => `${Number(value.toFixed(2))}`;

  let recommendation: string;
  if (hoursNeededAll <= available) {
    recommendation = `There are enough machine hours to process all forecast demand: ${hours(
      hoursNeededAll,
    )} h covers every service, so the optimised plan equals the current one at ${peso(
      optimizedProfit,
    )}.`;
  } else if (partial) {
    recommendation = `Process all ${fullyServed.map((row) => row.service).join(", ") || "no service in full"}, then use the remaining ${hours(
      partial.hoursUsed,
    )} h on ${partial.units} ${partial.service} ${partial.unitLabel}s. Gain: +${peso(
      gainPesos,
    )} (+${round2(gainPct)}%).`;
  } else if (skipped.length > 0) {
    recommendation = `Process all ${fullyServed.map((row) => row.service).join(", ") || "no service in full"}; ${skipped
      .map((row) => row.service)
      .join(" and ")} gets no hours at ${available} h. Gain: +${peso(gainPesos)} (+${round2(
      gainPct,
    )}%).`;
  } else {
    recommendation = `Every forecast fits, so the current mix already earns ${peso(
      optimizedProfit,
    )}.`;
  }

  return {
    model: payload.model,
    modelLabel: MODEL_LABELS[payload.model],
    window: payload.window,
    alpha: payload.alpha,
    hoursAvailable: available,
    hoursNeededAll,
    currentPlan,
    optimizedPlan,
    rows: optimizedPlan.rows,
    totals: {
      currentProfit: currentPlan.totalProfit,
      optimizedProfit: optimizedPlan.totalProfit,
      currentUnits: currentPlan.units,
      optimizedUnits: optimizedPlan.units,
      forecastUnits: demand.reduce((sum, row) => sum + row.forecast, 0),
    },
    gainPesos,
    gainPct,
    recommendation,
    chart: demand.map((row) => ({
      service: row.name,
      forecast: row.forecast,
      current: currentRows.find((candidate) => candidate.serviceId === row.id)?.units ?? 0,
      optimized: optimizedPlan.rows.find((candidate) => candidate.serviceId === row.id)?.units ?? 0,
    })),
  };
}

/** Newest orders used by the dashboard. */
export async function recentOrders(limit = 8) {
  const rows = await db
    .select({
      id: orders.id,
      service: services.name,
      week: orders.week,
      month: orders.month,
      units: orders.units,
      amount: payments.amount,
    })
    .from(orders)
    .innerJoin(services, eq(orders.serviceId, services.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .orderBy(desc(orders.week), desc(orders.id))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    amount: row.amount === null ? null : toNumber(row.amount),
  }));
}
