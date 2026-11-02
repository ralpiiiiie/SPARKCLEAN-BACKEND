/**
 * Controlled, read-only data-access layer for the AI assistant.
 *
 * Every number the assistant ever quotes is computed here, in trusted
 * TypeScript, from parameterized Drizzle queries. The language model only
 * *narrates* these facts — it never sees the database, never writes SQL, and
 * never performs arithmetic that ends up in the answer.
 *
 * Privacy: only the minimum fields needed for an answer leave this module.
 * Customers are reduced to { id?, name, orders, revenue, lastOrderDate }
 * — never phone, email or address.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, customers, orders, services } from "../../db/schema/index.js";
import { toNumber } from "../../utils/numbers.js";

export interface DateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
}

export interface RangeInput extends DateRange {
  branchId?: string | null;
  /** Admin-only multi-branch comparison. Never populated for managers. */
  branchIds?: string[] | null;
}

const MS_DAY = 86_400_000;

export function isoAddDays(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00.000Z`).getTime() + days * MS_DAY)
    .toISOString()
    .slice(0, 10);
}

export function isoDaysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00.000Z`).getTime();
  const b = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / MS_DAY) + 1;
}

function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function endOfMonth(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function startOfNextMonth(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Human label such as "December 2024" or "Dec 21 – Dec 27, 2024". */
export function rangeLabel(start: string, end: string): string {
  if (start === end) return formatDay(start);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const month = MONTHS[Number(start.slice(5, 7)) - 1];
    if (start.endsWith("-01") && end === endOfMonth(end)) return `${month} ${start.slice(0, 4)}`;
    return `${month} ${Number(start.slice(8, 10))} – ${Number(end.slice(8, 10))}, ${start.slice(0, 4)}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
}

function formatDay(isoDate: string): string {
  const month = MONTHS[Number(isoDate.slice(5, 7)) - 1]?.slice(0, 3) ?? isoDate.slice(5, 7);
  return `${month} ${Number(isoDate.slice(8, 10))}, ${isoDate.slice(0, 4)}`;
}

/* ────────────────────────── bounds & presets ────────────────────────── */

export interface DataBounds {
  min: string;
  max: string;
  latestMonthLabel: string;
  totalOrders: number;
}

export async function getDataBounds(branchId?: string | null): Promise<DataBounds> {
  const [row] = await db
    .select({
      min: sql<string | null>`min(${orders.orderDate})`,
      max: sql<string | null>`max(${orders.orderDate})`,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(branchId ? eq(orders.branchId, branchId) : undefined);

  const today = new Date().toISOString().slice(0, 10);
  const min = row?.min ?? today;
  const max = row?.max ?? today;
  const month = Number(max.slice(5, 7)) - 1;
  return {
    min,
    max,
    latestMonthLabel: `${MONTHS[month] ?? max.slice(5, 7)} ${max.slice(0, 4)}`,
    totalOrders: row?.count ?? 0,
  };
}

export type Preset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_15_days"
  | "last_30_days"
  | "this_year"
  | "last_year"
  | "all_time";

/**
 * Resolve a relative preset against the latest recorded data, mirroring the
 * dashboard's own period filter (rolling 7-day week, calendar month, etc.).
 * `bounds` is always the latest recorded data, never the wall clock, so the
 * assistant answers about the period the app is actually showing.
 */
export function resolvePreset(preset: Preset, bounds: DataBounds): DateRange {
  const anchor = bounds.max;
  switch (preset) {
    case "today":
      return { start: anchor, end: anchor };
    case "yesterday": {
      const day = isoAddDays(anchor, -1);
      return { start: day, end: day };
    }
    case "this_week":
      return { start: clamp(isoAddDays(anchor, -6), bounds), end: anchor };
    case "last_week": {
      const end = isoAddDays(anchor, -7);
      return { start: clamp(isoAddDays(end, -6), bounds), end };
    }
    case "this_month":
      return { start: startOfMonth(anchor), end: anchor };
    case "last_month": {
      const start = startOfMonth(isoAddDays(startOfMonth(anchor), -1));
      return { start, end: endOfMonth(start) };
    }
    case "last_15_days":
      return { start: clamp(isoAddDays(anchor, -14), bounds), end: anchor };
    case "last_30_days":
      return { start: clamp(isoAddDays(anchor, -29), bounds), end: anchor };
    case "this_year":
      return { start: `${anchor.slice(0, 4)}-01-01`, end: anchor };
    case "last_year": {
      const year = Number(anchor.slice(0, 4)) - 1;
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    case "all_time":
    default:
      return { start: bounds.min, end: bounds.max };
  }
}

function clamp(isoDate: string, bounds: DataBounds): string {
  if (isoDate < bounds.min) return bounds.min;
  if (isoDate > bounds.max) return bounds.max;
  return isoDate;
}

/** Clamp any range to the recorded data window. */
export function clampRange(range: DateRange, bounds: DataBounds): DateRange {
  const start = clamp(range.start, bounds);
  const end = clamp(range.end, bounds);
  return start <= end ? { start, end } : { start: bounds.max, end: bounds.max };
}

/** Whole calendar month for a `YYYY-MM` key, clamped to recorded data. */
export function monthRange(yearMonth: string, bounds: DataBounds): DateRange {
  const start = `${yearMonth}-01`;
  const end = endOfMonth(start);
  return { start: clamp(start, bounds), end: clamp(end, bounds) };
}

export function previousMonthKey(yearMonth: string): string {
  const d = new Date(`${yearMonth}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export function nextMonthKey(yearMonth: string): string {
  const d = new Date(`${yearMonth}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthLabelOf(yearMonth: string): string {
  const month = MONTHS[Number(yearMonth.slice(5, 7)) - 1] ?? yearMonth;
  return `${month} ${yearMonth.slice(0, 4)}`;
}

export { startOfMonth, endOfMonth, startOfNextMonth };

/* ────────────────────────── raw range fetch ────────────────────────── */

interface RangeOrder {
  id: string;
  customerId: string;
  customerName: string;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  status: "Received" | "Washing" | "Ready" | "Delivered" | "Cancelled";
  paymentMethod: string;
  orderDate: string;
}

async function fetchRange(input: RangeInput): Promise<RangeOrder[]> {
  const conditions = [gte(orders.orderDate, input.start), lte(orders.orderDate, input.end)];
  if (input.branchIds && input.branchIds.length > 0) {
    conditions.push(inArray(orders.branchId, input.branchIds));
  } else if (input.branchId) {
    conditions.push(eq(orders.branchId, input.branchId));
  }

  const rows = await db
    .select({
      id: orders.id,
      customerId: orders.customerId,
      customerName: customers.name,
      branchId: orders.branchId,
      branchName: branches.name,
      serviceId: orders.serviceId,
      serviceName: services.name,
      amount: orders.amount,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      orderDate: orders.orderDate,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .innerJoin(branches, eq(orders.branchId, branches.id))
    .innerJoin(services, eq(orders.serviceId, services.id))
    .where(and(...conditions));

  return rows.map((row) => ({ ...row, amount: toNumber(row.amount) }));
}

/* ────────────────────────── aggregates ────────────────────────── */

export interface SummaryMetrics {
  revenue: number;
  billableOrders: number;
  cancelled: number;
  totalOrders: number;
  aov: number;
  completed: number;
  pending: number;
  inProgress: number;
  completionRate: number;
  cancellationRate: number;
  activeCustomers: number;
}

export function summarize(rows: RangeOrder[]): SummaryMetrics {
  const billable = rows.filter((r) => r.status !== "Cancelled");
  const revenue = billable.reduce((sum, r) => sum + r.amount, 0);
  let completed = 0;
  let pending = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const r of rows) {
    if (r.status === "Delivered") completed += 1;
    else if (r.status === "Received") pending += 1;
    else if (r.status === "Washing" || r.status === "Ready") inProgress += 1;
    else if (r.status === "Cancelled") cancelled += 1;
  }
  return {
    revenue: Math.round(revenue),
    billableOrders: billable.length,
    cancelled,
    totalOrders: rows.length,
    aov: billable.length ? Math.round(revenue / billable.length) : 0,
    completed,
    pending,
    inProgress,
    completionRate: rows.length ? (completed / rows.length) * 100 : 0,
    cancellationRate: rows.length ? (cancelled / rows.length) * 100 : 0,
    activeCustomers: new Set(billable.map((r) => r.customerId)).size,
  };
}

export interface DailyPoint {
  date: string;
  label: string;
  orders: number;
  revenue: number;
}

/** Zero-filled daily series so the chart keeps an even time axis. */
export function dailySeries(rows: RangeOrder[], range: DateRange): DailyPoint[] {
  const bucket = new Map<string, { orders: number; revenue: number }>();
  for (const row of rows) {
    if (row.status === "Cancelled") continue;
    const key = row.orderDate.slice(0, 10);
    const b = bucket.get(key) ?? { orders: 0, revenue: 0 };
    b.orders += 1;
    b.revenue += row.amount;
    bucket.set(key, b);
  }

  const out: DailyPoint[] = [];
  const last = new Date(`${range.end}T00:00:00.000Z`).getTime();
  for (let t = new Date(`${range.start}T00:00:00.000Z`).getTime(); t <= last; t += MS_DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    const b = bucket.get(key) ?? { orders: 0, revenue: 0 };
    out.push({
      date: key,
      label: formatDay(key).replace(/, \d{4}$/, ""),
      orders: b.orders,
      revenue: Math.round(b.revenue),
    });
  }
  return out;
}

export interface ServiceRow {
  serviceId: string;
  name: string;
  orders: number;
  revenue: number;
  sharePct: number;
  avgValue: number;
}

export function serviceBreakdown(rows: RangeOrder[]): ServiceRow[] {
  const billable = rows.filter((r) => r.status !== "Cancelled");
  const total = billable.length;
  const map = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const row of billable) {
    const b = map.get(row.serviceId) ?? { name: row.serviceName, orders: 0, revenue: 0 };
    b.orders += 1;
    b.revenue += row.amount;
    map.set(row.serviceId, b);
  }
  return [...map.entries()]
    .map(([serviceId, b]) => ({
      serviceId,
      name: b.name,
      orders: b.orders,
      revenue: Math.round(b.revenue),
      sharePct: total ? (b.orders / total) * 100 : 0,
      avgValue: b.orders ? Math.round(b.revenue / b.orders) : 0,
    }))
    .sort((a, b) => b.orders - a.orders);
}

export interface BranchRow {
  branchId: string;
  name: string;
  orders: number;
  revenue: number;
  aov: number;
  sharePct: number;
}

export function branchBreakdown(rows: RangeOrder[]): BranchRow[] {
  const billable = rows.filter((r) => r.status !== "Cancelled");
  const totalRevenue = billable.reduce((sum, r) => sum + r.amount, 0);
  const map = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const row of billable) {
    const b = map.get(row.branchId) ?? { name: row.branchName, orders: 0, revenue: 0 };
    b.orders += 1;
    b.revenue += row.amount;
    map.set(row.branchId, b);
  }
  return [...map.entries()]
    .map(([branchId, b]) => ({
      branchId,
      name: b.name,
      orders: b.orders,
      revenue: Math.round(b.revenue),
      aov: b.orders ? Math.round(b.revenue / b.orders) : 0,
      sharePct: totalRevenue ? (b.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface PaymentRow {
  method: string;
  orders: number;
  revenue: number;
  sharePct: number;
}

export function paymentBreakdown(rows: RangeOrder[]): PaymentRow[] {
  const billable = rows.filter((r) => r.status !== "Cancelled");
  const total = billable.length;
  const map = new Map<string, { orders: number; revenue: number }>();
  for (const row of billable) {
    const b = map.get(row.paymentMethod) ?? { orders: 0, revenue: 0 };
    b.orders += 1;
    b.revenue += row.amount;
    map.set(row.paymentMethod, b);
  }
  return [...map.entries()]
    .map(([method, b]) => ({
      method,
      orders: b.orders,
      revenue: Math.round(b.revenue),
      sharePct: total ? (b.orders / total) * 100 : 0,
    }))
    .sort((a, b) => b.orders - a.orders);
}

/* ────────────────────────── monthly trend ────────────────────────── */

export interface MonthRow {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  aov: number;
}

/** Full monthly revenue/order series (billable orders only), optionally scoped to a branch. */
export async function monthlyTrend(branchId?: string | null): Promise<MonthRow[]> {
  const rows = await db
    .select({
      key: sql<string>`to_char(${orders.orderDate}, 'YYYY-MM')`,
      orders: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${orders.amount}), 0)`,
    })
    .from(orders)
    .where(
      and(
        sql`${orders.status} <> 'Cancelled'`,
        branchId ? eq(orders.branchId, branchId) : undefined,
      ),
    )
    .groupBy(sql`to_char(${orders.orderDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${orders.orderDate}, 'YYYY-MM')`);

  return rows.map((row) => {
    const revenue = Math.round(toNumber(row.revenue));
    return {
      key: row.key,
      label: monthLabelOf(row.key),
      orders: row.orders,
      revenue,
      aov: row.orders ? Math.round(revenue / row.orders) : 0,
    };
  });
}

/* ────────────────────────── customers ────────────────────────── */

export interface CustomerFacts {
  totalCustomers: number;
  activeCustomers: number;
  repeatCustomers: number;
  oneTimeCustomers: number;
  repeatRate: number;
  ordersPerCustomer: number;
  dormantCustomers: number;
  dormantCutoff: string;
  newCustomers: number;
  topCustomers: Array<{
    name: string;
    orders: number;
    revenue: number;
    lastOrderDate: string;
  }>;
}

export async function customerFacts(options: {
  range: DateRange;
  bounds: DataBounds;
  branchId?: string | null;
  dormantDays?: number;
  topLimit?: number;
}): Promise<CustomerFacts> {
  const { range, bounds, branchId } = options;
  const dormantDays = options.dormantDays ?? 90;
  const topLimit = options.topLimit ?? 5;
  const dormantCutoff = isoAddDays(bounds.max, -dormantDays);

  const [allCustomers, orderAgg, recentAgg] = await Promise.all([
    db
      .select({ id: customers.id })
      .from(customers)
      .where(branchId ? eq(customers.branchId, branchId) : undefined),
    db
      .select({
        customerId: orders.customerId,
        customerName: customers.name,
        orders: sql<number>`count(*)::int`,
        revenue: sql<string>`coalesce(sum(${orders.amount}), 0)`,
        lastOrder: sql<string>`max(${orders.orderDate})`,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(
        and(
          sql`${orders.status} <> 'Cancelled'`,
          branchId ? eq(orders.branchId, branchId) : undefined,
        ),
      )
      .groupBy(orders.customerId, customers.name),
    db
      .select({
        customerId: orders.customerId,
        orders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.orderDate, range.start),
          lte(orders.orderDate, range.end),
          sql`${orders.status} <> 'Cancelled'`,
          branchId ? eq(orders.branchId, branchId) : undefined,
        ),
      )
      .groupBy(orders.customerId),
  ]);

  const repeat = orderAgg.filter((row) => row.orders > 1).length;
  const activeSet = new Set(recentAgg.map((row) => row.customerId));
  const activeCustomers = activeSet.size || orderAgg.length;
  const totalBillableOrders = orderAgg.reduce((sum, row) => sum + row.orders, 0);

  // Dormant: has ordered before, but nothing since the cutoff.
  const lastOrderByCustomer = new Map(
    orderAgg.map((row) => [row.customerId, row.lastOrder.slice(0, 10)]),
  );
  let dormantCustomers = 0;
  for (const [, lastOrder] of lastOrderByCustomer) {
    if (lastOrder < dormantCutoff) dormantCustomers += 1;
  }

  const newCustomers = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        gte(customers.joinDate, range.start),
        lte(customers.joinDate, range.end),
        branchId ? eq(customers.branchId, branchId) : undefined,
      ),
    )
    .then((rows) => rows[0]?.n ?? 0);

  const topCustomers = [...orderAgg]
    .sort((a, b) => b.orders - a.orders || toNumber(b.revenue) - toNumber(a.revenue))
    .slice(0, topLimit)
    .map((row) => ({
      name: row.customerName,
      orders: row.orders,
      revenue: Math.round(toNumber(row.revenue)),
      lastOrderDate: row.lastOrder.slice(0, 10),
    }));

  return {
    totalCustomers: allCustomers.length,
    activeCustomers,
    repeatCustomers: repeat,
    oneTimeCustomers: Math.max(orderAgg.length - repeat, 0),
    repeatRate: orderAgg.length ? (repeat / orderAgg.length) * 100 : 0,
    ordersPerCustomer: orderAgg.length ? totalBillableOrders / orderAgg.length : 0,
    dormantCustomers,
    dormantCutoff,
    newCustomers,
    topCustomers,
  };
}

/* ────────────────────────── pending orders ────────────────────────── */

export interface PendingFacts {
  received: number;
  washing: number;
  ready: number;
  inFlight: number;
  oldestPendingDate: string | null;
}

export async function pendingFacts(branchId?: string | null): Promise<PendingFacts> {
  const rows = await db
    .select({
      status: orders.status,
      n: sql<number>`count(*)::int`,
      oldest: sql<string | null>`min(${orders.orderDate})`,
    })
    .from(orders)
    .where(
      and(
        sql`${orders.status} in ('Received', 'Washing', 'Ready')`,
        branchId ? eq(orders.branchId, branchId) : undefined,
      ),
    )
    .groupBy(orders.status);

  const byStatus = new Map(rows.map((row) => [row.status, row]));
  const received = byStatus.get("Received")?.n ?? 0;
  const washing = byStatus.get("Washing")?.n ?? 0;
  const ready = byStatus.get("Ready")?.n ?? 0;
  const oldestDates = rows.map((row) => row.oldest).filter((v): v is string => Boolean(v));

  return {
    received,
    washing,
    ready,
    inFlight: received + washing + ready,
    oldestPendingDate: oldestDates.length ? oldestDates.sort()[0].slice(0, 10) : null,
  };
}

/* ────────────────────────── public entry points ────────────────────────── */

export interface RangeAnalysis {
  range: DateRange;
  summary: SummaryMetrics;
  daily: DailyPoint[];
  services: ServiceRow[];
  branches: BranchRow[];
  payments: PaymentRow[];
  rowCount: number;
}

export async function analyzeRange(input: RangeInput): Promise<RangeAnalysis> {
  const rows = await fetchRange(input);
  return {
    range: { start: input.start, end: input.end },
    summary: summarize(rows),
    daily: dailySeries(rows, input),
    services: serviceBreakdown(rows),
    branches: branchBreakdown(rows),
    payments: paymentBreakdown(rows),
    rowCount: rows.length,
  };
}

/**
 * Branch list for name → id resolution without exposing anything else.
 * The AI always passes `null` (all branch names are public store locations) so
 * it can *detect* a cross-branch question; the response builder then refuses or
 * filters before any business data is read.
 */
export async function listBranchRefs(
  branchId?: string | null,
): Promise<Array<{ id: string; name: string; city: string }>> {
  return db
    .select({ id: branches.id, name: branches.name, city: branches.city })
    .from(branches)
    .where(branchId ? eq(branches.id, branchId) : undefined);
}
