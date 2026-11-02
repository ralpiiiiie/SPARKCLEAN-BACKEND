/**
 * Builds the grounded facts, KPI cards, tables and chart specifications for
 * each approved topic. The language model only rewrites `fallbackNarrative`;
 * every number here is computed from database aggregates.
 */
import {
  type DataBounds,
  type DailyPoint,
  type MonthRow,
  analyzeRange,
  customerFacts,
  getDataBounds,
  isoDaysBetween,
  monthlyTrend,
  pendingFacts,
  rangeLabel,
  resolvePreset,
} from "./dataService.js";
import type { ParsedIntent } from "./intent.js";
import type { ChartSpec, KpiSpec, TableSpec } from "./types.js";

export interface BuiltResponse {
  facts: unknown;
  kpis: KpiSpec[];
  table: TableSpec | null;
  chart: ChartSpec | null;
  range: { start: string; end: string; label: string; note: string } | null;
  fallbackNarrative: string;
  followups: string[];
  grounding: string[];
}

const peso = (value: number): string => `₱${Math.round(value).toLocaleString("en-PH")}`;
const num = (value: number): string => Math.round(value).toLocaleString("en-PH");
const pct = (value: number): string => `${value.toFixed(1)}%`;
const signedPct = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const plural = (count: number, one: string, many: string): string =>
  `${num(count)} ${count === 1 ? one : many}`;
const weekdayLabel = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function bucketWeekly(points: DailyPoint[]): Array<{ label: string; orders: number; revenue: number }> {
  const out: Array<{ label: string; orders: number; revenue: number }> = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    out.push({
      label: `${weekdayLabel(first.date)} – ${weekdayLabel(last.date)}`,
      orders: chunk.reduce((sum, p) => sum + p.orders, 0),
      revenue: chunk.reduce((sum, p) => sum + p.revenue, 0),
    });
  }
  return out;
}

function dailyTable(points: DailyPoint[], title: string): TableSpec {
  return {
    title,
    columns: [
      { key: "date", label: "Date" },
      { key: "orders", label: "Orders", align: "right", format: "number" },
      { key: "revenue", label: "Revenue", align: "right", format: "currency" },
    ],
    rows: points.map((p) => ({ date: p.label, orders: p.orders, revenue: p.revenue })),
  };
}

function weeklyTable(points: DailyPoint[], title: string): TableSpec {
  return {
    title,
    columns: [
      { key: "week", label: "Week" },
      { key: "orders", label: "Orders", align: "right", format: "number" },
      { key: "revenue", label: "Revenue", align: "right", format: "currency" },
    ],
    rows: bucketWeekly(points).map((b) => ({ week: b.label, orders: b.orders, revenue: b.revenue })),
  };
}

function monthlyTable(rows: MonthRow[], title: string): TableSpec {
  return {
    title,
    columns: [
      { key: "month", label: "Month" },
      { key: "orders", label: "Orders", align: "right", format: "number" },
      { key: "revenue", label: "Revenue", align: "right", format: "currency" },
      { key: "aov", label: "Avg. order", align: "right", format: "currency" },
    ],
    rows: rows.map((r) => ({ month: r.label, orders: r.orders, revenue: r.revenue, aov: r.aov })),
  };
}

function rangeNote(intent: ParsedIntent, bounds: DataBounds): string {
  if (intent.preset === "explicit" && intent.range.start > bounds.max) {
    return "This period is after the latest recorded data.";
  }
  if (!intent.explicitPeriod && intent.preset === "context") {
    return "Continuing from the period discussed earlier in this conversation.";
  }
  if (intent.preset === "all_time") {
    return `All recorded data (${bounds.min} to ${bounds.max}).`;
  }
  return `Relative dates are anchored to the latest recorded data (${bounds.max}).`;
}

/* ───────────────────────────── revenue ───────────────────────────── */

async function buildRevenue(intent: ParsedIntent, bounds: DataBounds, trend: MonthRow[]): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: intent.branchId });
  const { summary, daily } = analysis;
  const days = isoDaysBetween(analysis.range.start, analysis.range.end);
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  if (intent.flags.bestMonth || intent.flags.worstMonth) {
    const sorted = [...trend].sort((a, b) => b.revenue - a.revenue);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const focus = intent.flags.worstMonth ? worst : best;
    return {
      facts: {
        questionFocus: intent.flags.worstMonth ? "lowest revenue month" : "highest revenue month",
        months: trend.map((m) => ({ month: m.label, revenue: m.revenue, orders: m.orders })),
        bestMonth: best ? { month: best.label, revenue: best.revenue, orders: best.orders } : null,
        worstMonth: worst ? { month: worst.label, revenue: worst.revenue, orders: worst.orders } : null,
        currency: "PHP (₱)",
        note: "Revenue excludes Cancelled orders.",
      },
      kpis: [
        { label: intent.flags.worstMonth ? "Lowest month" : "Highest month", value: focus?.revenue ?? 0, format: "currency", caption: focus?.label ?? "—" },
        { label: "Months recorded", value: trend.length, format: "number" },
        { label: "Total revenue (all time)", value: trend.reduce((s, m) => s + m.revenue, 0), format: "currency" },
        { label: "Average monthly revenue", value: trend.length ? Math.round(trend.reduce((s, m) => s + m.revenue, 0) / trend.length) : 0, format: "currency" },
      ],
      table: monthlyTable(trend, "Monthly revenue"),
      chart: {
        type: "bar",
        title: "Monthly revenue",
        subtitle: "All recorded months",
        xKey: "month",
        series: [{ key: "revenue", label: "Revenue" }],
        data: trend.map((m) => ({ month: m.label, revenue: m.revenue })),
        valueFormat: "currency",
      },
      range: { start: bounds.min, end: bounds.max, label: "All recorded data", note: "All recorded months." },
      fallbackNarrative:
        `Across ${trend.length} recorded months, revenue totalled ${peso(trend.reduce((s, m) => s + m.revenue, 0))}. ` +
        (best ? `The highest-revenue month was ${best.label} with ${peso(best.revenue)} from ${num(best.orders)} billable orders` : "") +
        (worst && worst !== best ? `, while the lowest was ${worst.label} at ${peso(worst.revenue)}.` : "."),
      followups: ["Show the monthly revenue trend", "Compare this month with last month", "Which branch earns the most?"],
      grounding: ["Revenue sums billable order amounts (Cancelled excluded).", "Monthly totals are grouped by order date."],
    };
  }

  const kpis: KpiSpec[] = [
    { label: "Total revenue", value: summary.revenue, format: "currency", caption: label },
    { label: "Billable orders", value: summary.billableOrders, format: "number", caption: `${num(summary.cancelled)} cancelled excluded` },
    { label: "Average order value", value: summary.aov, format: "currency" },
    { label: "Active customers", value: summary.activeCustomers, format: "number" },
  ];

  const chart: ChartSpec =
    days <= 45
      ? {
          type: "line",
          title: "Daily revenue",
          subtitle: label,
          xKey: "label",
          series: [{ key: "revenue", label: "Revenue" }],
          data: daily.map((p) => ({ label: p.label, revenue: p.revenue })),
          valueFormat: "currency",
        }
      : {
          type: "bar",
          title: "Monthly revenue",
          subtitle: "Last 12 recorded months",
          xKey: "month",
          series: [{ key: "revenue", label: "Revenue" }],
          data: trend.slice(-12).map((m) => ({ month: m.label, revenue: m.revenue })),
          valueFormat: "currency",
        };

  const dailyShareNote =
    daily.length > 0
      ? `The busiest day was ${daily.reduce((a, b) => (b.revenue > a.revenue ? b : a)).label}.`
      : "";

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      branch: intent.branchName,
      revenue: summary.revenue,
      billableOrders: summary.billableOrders,
      cancelledOrders: summary.cancelled,
      averageOrderValue: summary.aov,
      activeCustomers: summary.activeCustomers,
      dailyRevenue: daily.map((p) => ({ date: p.date, revenue: p.revenue, orders: p.orders })),
      currency: "PHP (₱)",
      note: "Revenue = sum of amounts for orders whose status is not Cancelled.",
    },
    kpis,
    table: days <= 31 ? dailyTable(daily, `Daily revenue · ${label}`) : weeklyTable(daily, `Weekly revenue · ${label}`),
    chart,
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      `Revenue for ${label} was ${peso(summary.revenue)} from ${plural(summary.billableOrders, "billable order", "billable orders")} ` +
      `(average order value ${peso(summary.aov)}). ${plural(summary.cancelled, "cancelled order was", "cancelled orders were")} excluded. ` +
      dailyShareNote,
    followups: [
      "Compare this with the previous period",
      "Which service drove the most revenue?",
      "Show the daily revenue breakdown",
    ],
    grounding: [
      "Revenue excludes Cancelled orders.",
      `Date range: ${analysis.range.start} to ${analysis.range.end}.`,
    ],
  };
}

/* ───────────────────────────── compare ───────────────────────────── */

async function buildCompare(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const pair = intent.compare ?? {
    current: intent.range,
    previous: resolvePreset("last_month", bounds),
  };
  const [current, previous] = await Promise.all([
    analyzeRange({ ...pair.current, branchId: intent.branchId }),
    analyzeRange({ ...pair.previous, branchId: intent.branchId }),
  ]);

  const currentLabel = rangeLabel(pair.current.start, pair.current.end);
  const previousLabel = rangeLabel(pair.previous.start, pair.previous.end);
  const revenueDiff = current.summary.revenue - previous.summary.revenue;
  const revenuePct = pctChange(current.summary.revenue, previous.summary.revenue);
  const ordersDiff = current.summary.billableOrders - previous.summary.billableOrders;
  const ordersPct = pctChange(current.summary.billableOrders, previous.summary.billableOrders);
  const aovPct = pctChange(current.summary.aov, previous.summary.aov);

  return {
    facts: {
      current: { period: currentLabel, ...current.summary },
      previous: { period: previousLabel, ...previous.summary },
      revenueDifference: revenueDiff,
      revenueChangePct: revenuePct,
      ordersDifference: ordersDiff,
      ordersChangePct: ordersPct,
      aovChangePct: aovPct,
      currency: "PHP (₱)",
      note: "Both periods use the same rules: Cancelled orders excluded from revenue.",
    },
    kpis: [
      { label: `Revenue · ${currentLabel}`, value: current.summary.revenue, format: "currency", delta: revenuePct ?? undefined, trend: revenueDiff >= 0 ? "up" : "down", deltaLabel: "vs previous" },
      { label: `Revenue · ${previousLabel}`, value: previous.summary.revenue, format: "currency" },
      { label: "Difference", value: revenueDiff, format: "currency", delta: revenuePct ?? undefined, trend: revenueDiff >= 0 ? "up" : "down" },
      { label: "Order volume change", value: ordersDiff, format: "number", delta: ordersPct ?? undefined, trend: ordersDiff >= 0 ? "up" : "down" },
    ],
    table: {
      title: "Period comparison",
      columns: [
        { key: "metric", label: "Metric" },
        { key: "current", label: currentLabel, align: "right" },
        { key: "previous", label: previousLabel, align: "right" },
        { key: "change", label: "Change", align: "right" },
      ],
      rows: [
        { metric: "Revenue", current: peso(current.summary.revenue), previous: peso(previous.summary.revenue), change: revenuePct === null ? "—" : signedPct(revenuePct) },
        { metric: "Billable orders", current: num(current.summary.billableOrders), previous: num(previous.summary.billableOrders), change: ordersPct === null ? "—" : signedPct(ordersPct) },
        { metric: "Average order value", current: peso(current.summary.aov), previous: peso(previous.summary.aov), change: aovPct === null ? "—" : signedPct(aovPct) },
        { metric: "Completed orders", current: num(current.summary.completed), previous: num(previous.summary.completed), change: `${current.summary.completed - previous.summary.completed >= 0 ? "+" : ""}${current.summary.completed - previous.summary.completed}` },
      ],
    },
    chart: {
      type: "comparison",
      title: "Revenue comparison",
      subtitle: `${currentLabel} vs ${previousLabel}`,
      xKey: "period",
      series: [{ key: "revenue", label: "Revenue" }],
      data: [
        { period: currentLabel, revenue: current.summary.revenue },
        { period: previousLabel, revenue: previous.summary.revenue },
      ],
      valueFormat: "currency",
    },
    range: { start: pair.current.start, end: pair.current.end, label: currentLabel, note: `Compared with ${previousLabel}.` },
    fallbackNarrative:
      `Revenue was ${peso(current.summary.revenue)} in ${currentLabel} versus ${peso(previous.summary.revenue)} in ${previousLabel}, ` +
      `a ${revenueDiff >= 0 ? "gain" : "decline"} of ${peso(Math.abs(revenueDiff))}` +
      (revenuePct === null ? "." : ` (${signedPct(revenuePct)}). `) +
      `Billable orders moved from ${num(previous.summary.billableOrders)} to ${num(current.summary.billableOrders)}.`,
    followups: ["What drove the change?", "Show the daily trend for this period", "Which branch performed best?"],
    grounding: [
      `Current period ${pair.current.start}–${pair.current.end}; previous ${pair.previous.start}–${pair.previous.end}.`,
      "Percentage change is omitted when the previous value is zero.",
    ],
  };
}

/* ───────────────────────────── orders ───────────────────────────── */

async function buildOrders(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: intent.branchId });
  const { summary, daily } = analysis;
  const days = isoDaysBetween(analysis.range.start, analysis.range.end);
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  const chartType: ChartSpec["type"] = intent.flags.trend || days > 45 ? "area" : "bar";

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      branch: intent.branchName,
      billableOrders: summary.billableOrders,
      totalOrders: summary.totalOrders,
      completed: summary.completed,
      pending: summary.pending,
      inProgress: summary.inProgress,
      cancelled: summary.cancelled,
      completionRate: summary.completionRate,
      dailyOrders: daily.map((p) => ({ date: p.date, orders: p.orders })),
      note: "Counts include every order status; revenue figures would exclude Cancelled.",
    },
    kpis: [
      { label: "Orders", value: summary.billableOrders, format: "number", caption: `${num(summary.cancelled)} cancelled included separately` },
      { label: "Completed", value: summary.completed, format: "number" },
      { label: "In progress", value: summary.inProgress, format: "number", caption: "Washing + Ready" },
      { label: "Awaiting pickup", value: summary.pending, format: "number", caption: "Status: Received" },
    ],
    table: days <= 31 ? dailyTable(daily, `Daily orders · ${label}`) : weeklyTable(daily, `Weekly orders · ${label}`),
    chart: {
      type: chartType,
      title: "Order volume",
      subtitle: label,
      xKey: "label",
      series: [{ key: "orders", label: "Orders" }],
      data: daily.map((p) => ({ label: p.label, orders: p.orders })),
      valueFormat: "number",
    },
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      `${plural(summary.billableOrders, "billable order was", "billable orders were")} recorded for ${label}` +
      (intent.branchName ? ` at the ${intent.branchName} branch` : "") +
      `, with ${num(summary.completed)} delivered, ${num(summary.inProgress)} in progress and ${num(summary.pending)} still awaiting pickup. ` +
      `The completion rate for the period is ${pct(summary.completionRate)}.`,
    followups: ["Show me the order trends for the last 15 days", "How many orders are still pending?", "What is our completion rate?"],
    grounding: [
      "Billable orders exclude Cancelled records.",
      `Date range: ${analysis.range.start} to ${analysis.range.end}.`,
    ],
  };
}

/* ───────────────────────────── completion ───────────────────────────── */

async function buildCompletion(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: intent.branchId });
  const { summary } = analysis;
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      totalOrders: summary.totalOrders,
      completed: summary.completed,
      pending: summary.pending,
      inProgress: summary.inProgress,
      cancelled: summary.cancelled,
      completionRate: summary.completionRate,
      cancellationRate: summary.cancellationRate,
      note: "Completion rate = Delivered ÷ all orders, including Cancelled.",
    },
    kpis: [
      { label: "Completion rate", value: summary.completionRate, format: "percent", caption: `${num(summary.completed)} of ${num(summary.totalOrders)} delivered` },
      { label: "Delivered", value: summary.completed, format: "number" },
      { label: "In progress", value: summary.inProgress, format: "number" },
      { label: "Cancellation rate", value: summary.cancellationRate, format: "percent", trend: summary.cancellationRate > 10 ? "down" : "neutral" },
    ],
    table: {
      title: `Order status split · ${label}`,
      columns: [
        { key: "status", label: "Status" },
        { key: "orders", label: "Orders", align: "right", format: "number" },
        { key: "share", label: "Share", align: "right", format: "percent" },
      ],
      rows: [
        { status: "Delivered", orders: summary.completed, share: summary.totalOrders ? (summary.completed / summary.totalOrders) * 100 : 0 },
        { status: "Washing / Ready", orders: summary.inProgress, share: summary.totalOrders ? (summary.inProgress / summary.totalOrders) * 100 : 0 },
        { status: "Received (pending)", orders: summary.pending, share: summary.totalOrders ? (summary.pending / summary.totalOrders) * 100 : 0 },
        { status: "Cancelled", orders: summary.cancelled, share: summary.totalOrders ? (summary.cancelled / summary.totalOrders) * 100 : 0 },
      ],
    },
    chart: {
      type: "doughnut",
      title: "Order status split",
      subtitle: label,
      xKey: "name",
      series: [{ key: "value", label: "Orders" }],
      data: [
        { name: "Delivered", value: summary.completed },
        { name: "Washing / Ready", value: summary.inProgress },
        { name: "Received", value: summary.pending },
        { name: "Cancelled", value: summary.cancelled },
      ],
      valueFormat: "number",
    },
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      `For ${label}, ${num(summary.completed)} of ${num(summary.totalOrders)} orders were delivered — a completion rate of ${pct(summary.completionRate)}. ` +
      `${num(summary.inProgress)} orders are currently in progress and ${num(summary.pending)} are pending, while ${num(summary.cancelled)} were cancelled (${pct(summary.cancellationRate)}).`,
    followups: ["How many orders are still pending?", "Compare this with last month", "Which branch has the lowest completion rate?"],
    grounding: ["Completion rate = Delivered ÷ all orders (including Cancelled)."],
  };
}

/* ───────────────────────────── pending ───────────────────────────── */

async function buildPending(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const pending = await pendingFacts();
  const total = pending.inFlight;

  return {
    facts: {
      asOfDate: bounds.max,
      received: pending.received,
      washing: pending.washing,
      ready: pending.ready,
      inFlight: total,
      oldestPendingDate: pending.oldestPendingDate,
      note: "Open orders across the whole business (all branches): Received, Washing and Ready.",
    },
    kpis: [
      { label: "Open orders", value: total, format: "number", caption: `as of ${bounds.max}` },
      { label: "Received", value: pending.received, format: "number", caption: "Not started" },
      { label: "Washing", value: pending.washing, format: "number" },
      { label: "Ready", value: pending.ready, format: "number", caption: "Awaiting pickup" },
    ],
    table: {
      title: "Open orders by stage",
      columns: [
        { key: "stage", label: "Stage" },
        { key: "orders", label: "Orders", align: "right", format: "number" },
      ],
      rows: [
        { stage: "Received", orders: pending.received },
        { stage: "Washing", orders: pending.washing },
        { stage: "Ready", orders: pending.ready },
        { stage: "Total open", orders: total },
      ],
    },
    chart: {
      type: "bar",
      title: "Open orders by stage",
      subtitle: `Snapshot at ${bounds.max}`,
      xKey: "stage",
      series: [{ key: "orders", label: "Orders" }],
      data: [
        { stage: "Received", orders: pending.received },
        { stage: "Washing", orders: pending.washing },
        { stage: "Ready", orders: pending.ready },
      ],
      valueFormat: "number",
    },
    range: null,
    fallbackNarrative:
      `There are currently ${num(total)} open orders: ${num(pending.received)} received, ${num(pending.washing)} in washing and ${num(pending.ready)} ready for pickup.` +
      (pending.oldestPendingDate
        ? ` The oldest open order dates back to ${pending.oldestPendingDate}, so it may be worth prioritising.`
        : ""),
    followups: ["What is our completion rate?", "Show the daily order trend", "Which branch has the most pending orders?"],
    grounding: ["Open orders are a live snapshot of Received, Washing and Ready statuses."],
  };
}

/* ───────────────────────────── customers ───────────────────────────── */

async function buildCustomers(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const facts = await customerFacts({ range: intent.range, bounds, topLimit: 6 });

  return {
    facts: {
      totalCustomers: facts.totalCustomers,
      activeCustomers: facts.activeCustomers,
      repeatCustomers: facts.repeatCustomers,
      oneTimeCustomers: facts.oneTimeCustomers,
      repeatRate: facts.repeatRate,
      ordersPerCustomer: facts.ordersPerCustomer,
      dormantCustomers: facts.dormantCustomers,
      dormantCutoff: facts.dormantCutoff,
      newCustomersInPeriod: facts.newCustomers,
      topCustomers: facts.topCustomers,
      note: "Contact details are never included. Dormant = no billable order since the cutoff date.",
    },
    kpis: [
      { label: "Total customers", value: facts.totalCustomers, format: "number" },
      { label: "Active (ordered in period)", value: facts.activeCustomers, format: "number", caption: `${rangeLabel(intent.range.start, intent.range.end)}` },
      { label: "Repeat customer rate", value: facts.repeatRate, format: "percent", caption: `${num(facts.repeatCustomers)} repeat customers` },
      { label: "Dormant customers", value: facts.dormantCustomers, format: "number", caption: `No order since ${facts.dormantCutoff}` },
    ],
    table: {
      title: "Most frequent customers",
      columns: [
        { key: "name", label: "Customer" },
        { key: "orders", label: "Orders", align: "right", format: "number" },
        { key: "revenue", label: "Revenue", align: "right", format: "currency" },
        { key: "lastOrder", label: "Last order", align: "right" },
      ],
      rows: facts.topCustomers.map((c) => ({
        name: c.name,
        orders: c.orders,
        revenue: c.revenue,
        lastOrder: c.lastOrderDate,
      })),
    },
    chart: {
      type: "bar",
      title: "Most frequent customers",
      subtitle: "By billable order count",
      xKey: "name",
      series: [{ key: "orders", label: "Orders" }],
      data: facts.topCustomers.map((c) => ({ name: c.name, orders: c.orders })),
      valueFormat: "number",
    },
    range: { start: intent.range.start, end: intent.range.end, label: rangeLabel(intent.range.start, intent.range.end), note: rangeNote(intent, bounds) },
    fallbackNarrative:
      `The business has ${num(facts.totalCustomers)} customers, of whom ${num(facts.activeCustomers)} ordered in the selected period. ` +
      `${num(facts.repeatCustomers)} are repeat customers (${pct(facts.repeatRate)} repeat rate) and ${num(facts.dormantCustomers)} have not ordered since ${facts.dormantCutoff}. ` +
      (facts.topCustomers[0]
        ? `The most frequent customer is ${facts.topCustomers[0].name} with ${num(facts.topCustomers[0].orders)} orders.`
        : ""),
    followups: ["Are there customers who have not ordered recently?", "Which service is most popular?", "Compare this month with last month"],
    grounding: [
      "Customer contact details are never sent to the assistant.",
      `Dormant threshold: no billable order since ${facts.dormantCutoff}.`,
    ],
  };
}

/* ───────────────────────────── services ───────────────────────────── */

async function buildServices(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: intent.branchId });
  const services = analysis.services;
  const top = services[0] ?? null;
  const least = services[services.length - 1] ?? null;
  const totalOrders = services.reduce((s, x) => s + x.orders, 0);
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  const focus = intent.flags.leastPopular ? least : top;

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      branch: intent.branchName,
      services: services.map((s) => ({ name: s.name, orders: s.orders, revenue: s.revenue, sharePct: Number(s.sharePct.toFixed(1)) })),
      mostPopular: top,
      leastPopular: least,
      totalBillableOrders: totalOrders,
      note: "Demand is measured by billable order count (Cancelled excluded).",
    },
    kpis: [
      { label: intent.flags.leastPopular ? "Least requested" : "Most popular service", value: focus?.orders ?? 0, format: "number", caption: focus?.name ?? "—" },
      { label: "Top service revenue", value: focus?.revenue ?? 0, format: "currency", caption: focus ? `${pct(focus.sharePct)} of orders` : undefined },
      { label: "Services used", value: services.filter((s) => s.orders > 0).length, format: "number" },
      { label: "Billable orders", value: totalOrders, format: "number", caption: label },
    ],
    table: {
      title: "Service demand",
      columns: [
        { key: "service", label: "Service" },
        { key: "orders", label: "Orders", align: "right", format: "number" },
        { key: "share", label: "Share", align: "right", format: "percent" },
        { key: "revenue", label: "Revenue", align: "right", format: "currency" },
      ],
      rows: services.map((s) => ({ service: s.name, orders: s.orders, share: s.sharePct, revenue: s.revenue })),
    },
    chart: {
      type: "bar",
      title: "Service demand",
      subtitle: `Billable orders · ${label}`,
      xKey: "service",
      series: [{ key: "orders", label: "Orders" }],
      data: services.slice(0, 8).map((s) => ({ service: s.name, orders: s.orders })),
      valueFormat: "number",
    },
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      (top
        ? `The most popular service is ${top.name} with ${num(top.orders)} orders (${pct(top.sharePct)} of all billable orders) and ${peso(top.revenue)} in revenue for ${label}. `
        : `No billable orders were recorded for ${label}. `) +
      (least && least !== top
        ? `${least.name} had the fewest requests at ${num(least.orders)} orders.`
        : ""),
    followups: ["Compare service demand across branches", "Which service earns the most revenue?", "Show me the daily order trend"],
    grounding: ["Service ranking uses billable order counts.", "Share is computed against all billable orders in the period."],
  };
}

/* ───────────────────────────── branches ───────────────────────────── */

async function buildBranches(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: null });
  const rows = analysis.branches;
  const top = rows[0] ?? null;
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      branches: rows.map((b) => ({ name: b.name, orders: b.orders, revenue: b.revenue, aov: b.aov, sharePct: Number(b.sharePct.toFixed(1)) })),
      topBranch: top,
      note: "All branches are included; revenue excludes Cancelled orders.",
    },
    kpis: [
      { label: "Top branch", value: top?.revenue ?? 0, format: "currency", caption: top?.name ?? "—" },
      { label: "Branches with orders", value: rows.length, format: "number" },
      { label: "Total revenue", value: analysis.summary.revenue, format: "currency", caption: label },
      { label: "Top branch AOV", value: top?.aov ?? 0, format: "currency" },
    ],
    table: {
      title: "Branch performance",
      columns: [
        { key: "branch", label: "Branch" },
        { key: "orders", label: "Orders", align: "right", format: "number" },
        { key: "revenue", label: "Revenue", align: "right", format: "currency" },
        { key: "share", label: "Rev. share", align: "right", format: "percent" },
        { key: "aov", label: "Avg. order", align: "right", format: "currency" },
      ],
      rows: rows.map((b) => ({ branch: b.name, orders: b.orders, revenue: b.revenue, share: b.sharePct, aov: b.aov })),
    },
    chart: {
      type: "bar",
      title: "Revenue by branch",
      subtitle: label,
      xKey: "branch",
      series: [{ key: "revenue", label: "Revenue" }],
      data: rows.map((b) => ({ branch: b.name, revenue: b.revenue })),
      valueFormat: "currency",
    },
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      (top
        ? `${top.name} led with ${peso(top.revenue)} across ${num(top.orders)} billable orders (${pct(top.sharePct)} of revenue) for ${label}. `
        : `No branch activity was recorded for ${label}. `) +
      (rows.length > 1
        ? `${rows[rows.length - 1].name} recorded the lowest revenue at ${peso(rows[rows.length - 1].revenue)}.`
        : ""),
    followups: ["Which branch has the highest average order value?", "Compare this month with last month", "Which service is most popular?"],
    grounding: ["Branch revenue uses billable orders only.", `Date range: ${analysis.range.start} to ${analysis.range.end}.`],
  };
}

/* ───────────────────────────── payments ───────────────────────────── */

async function buildPayments(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: intent.branchId });
  const rows = analysis.payments;
  const top = rows[0] ?? null;
  const digital = rows.filter((r) => r.method === "GCash" || r.method === "Maya" || r.method === "Card");
  const digitalOrders = digital.reduce((s, r) => s + r.orders, 0);
  const digitalShare = analysis.summary.billableOrders ? (digitalOrders / analysis.summary.billableOrders) * 100 : 0;
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      payments: rows,
      topMethod: top,
      digitalSharePct: Number(digitalShare.toFixed(1)),
      totalBillableOrders: analysis.summary.billableOrders,
      note: "Payment mix counts billable orders by recorded payment method. The system stores the method, not a settlement status.",
    },
    kpis: [
      { label: "Top payment method", value: top?.orders ?? 0, format: "number", caption: top ? `${top.method} · ${pct(top.sharePct)}` : "—" },
      { label: "Digital payments", value: digitalShare, format: "percent", caption: `${num(digitalOrders)} GCash/Maya/Card orders` },
      { label: "Cash orders", value: rows.find((r) => r.method === "Cash")?.orders ?? 0, format: "number" },
      { label: "Billable orders", value: analysis.summary.billableOrders, format: "number", caption: label },
    ],
    table: {
      title: `Payment mix · ${label}`,
      columns: [
        { key: "method", label: "Method" },
        { key: "orders", label: "Orders", align: "right", format: "number" },
        { key: "share", label: "Share", align: "right", format: "percent" },
        { key: "revenue", label: "Revenue", align: "right", format: "currency" },
      ],
      rows: rows.map((r) => ({ method: r.method, orders: r.orders, share: r.sharePct, revenue: r.revenue })),
    },
    chart: {
      type: "doughnut",
      title: "Payment mix",
      subtitle: label,
      xKey: "name",
      series: [{ key: "value", label: "Orders" }],
      data: rows.map((r) => ({ name: r.method, value: r.orders })),
      valueFormat: "number",
    },
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      (top
        ? `${top.method} was the most-used payment method for ${label} with ${num(top.orders)} orders (${pct(top.sharePct)}). `
        : `No payments were recorded for ${label}. `) +
      `${pct(digitalShare)} of billable orders were paid digitally (GCash, Maya or Card).`,
    followups: ["Show the revenue for this period", "Which branch has the highest revenue?", "Compare this month with last month"],
    grounding: ["Only the recorded payment method is counted; no card or account numbers exist in the dataset."],
  };
}

/* ───────────────────────────── performance ───────────────────────────── */

async function buildPerformance(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  const analysis = await analyzeRange({ ...intent.range, branchId: intent.branchId });
  const trend = await monthlyTrend();
  const pending = await pendingFacts();
  const customers = await customerFacts({ range: intent.range, bounds, topLimit: 3 });
  const services = analysis.services;
  const label = rangeLabel(analysis.range.start, analysis.range.end);

  const lastTwo = trend.slice(-2);
  const monthDeltaPct =
    lastTwo.length === 2 ? pctChange(lastTwo[1].revenue, lastTwo[0].revenue) : null;
  const topService = services[0] ?? null;
  const concentration = topService ? topService.sharePct : 0;

  // Evidence-based observations only — every sentence is tied to a number above.
  const observations: string[] = [];
  if (monthDeltaPct !== null) {
    observations.push(
      `${lastTwo[1].label} revenue ${monthDeltaPct >= 0 ? "grew" : "fell"} ${Math.abs(monthDeltaPct).toFixed(1)}% versus ${lastTwo[0].label}.`,
    );
  }
  if (analysis.summary.completionRate < 70) {
    observations.push(
      `Only ${pct(analysis.summary.completionRate)} of orders are marked Delivered, with ${num(pending.inFlight)} orders still open.`,
    );
  }
  if (concentration > 40 && topService) {
    observations.push(`${topService.name} accounts for ${pct(concentration)} of orders, a concentration risk.`);
  }
  if (customers.dormantCustomers > 0) {
    observations.push(`${num(customers.dormantCustomers)} customers have not ordered since ${customers.dormantCutoff}.`);
  }
  if (analysis.summary.cancellationRate > 12) {
    observations.push(`Cancellations are ${pct(analysis.summary.cancellationRate)} of orders in the period.`);
  }

  const recommendations: string[] = [];
  if (analysis.summary.completionRate < 70) {
    recommendations.push("Clear the open-order backlog (Received and Washing) before accepting more express jobs.");
  }
  if (concentration > 40 && topService) {
    recommendations.push(`Promote secondary services to reduce reliance on ${topService.name}.`);
  }
  if (customers.dormantCustomers > 0) {
    recommendations.push(`Run a win-back campaign for the ${num(customers.dormantCustomers)} dormant customers.`);
  }
  if (analysis.summary.cancellationRate > 12) {
    recommendations.push("Review cancellation reasons at intake to protect revenue.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain current operating performance and keep monitoring monthly revenue and completion rate.");
  }

  return {
    facts: {
      range: { start: analysis.range.start, end: analysis.range.end, label },
      summary: analysis.summary,
      branch: intent.branchName,
      monthly: trend.slice(-12).map((m) => ({ month: m.label, revenue: m.revenue, orders: m.orders, aov: m.aov })),
      latestMonthChangePct: monthDeltaPct,
      openOrders: pending.inFlight,
      dormantCustomers: customers.dormantCustomers,
      dormantCutoff: customers.dormantCutoff,
      repeatRate: customers.repeatRate,
      topService: topService ? { name: topService.name, sharePct: topService.sharePct } : null,
      observations,
      recommendations,
      currency: "PHP (₱)",
    },
    kpis: [
      { label: "Revenue", value: analysis.summary.revenue, format: "currency", delta: monthDeltaPct ?? undefined, trend: (monthDeltaPct ?? 0) >= 0 ? "up" : "down", deltaLabel: "latest month vs prior" },
      { label: "Billable orders", value: analysis.summary.billableOrders, format: "number", caption: label },
      { label: "Completion rate", value: analysis.summary.completionRate, format: "percent", trend: analysis.summary.completionRate >= 70 ? "up" : "down" },
      { label: "Repeat customer rate", value: customers.repeatRate, format: "percent" },
    ],
    table: monthlyTable(trend.slice(-12), "Monthly performance"),
    chart: {
      type: "line",
      title: "Monthly revenue trend",
      subtitle: "Last 12 recorded months",
      xKey: "month",
      series: [{ key: "revenue", label: "Revenue" }],
      data: trend.slice(-12).map((m) => ({ month: m.label, revenue: m.revenue })),
      valueFormat: "currency",
    },
    range: { start: analysis.range.start, end: analysis.range.end, label, note: rangeNote(intent, bounds) },
    fallbackNarrative:
      `For ${label}, revenue was ${peso(analysis.summary.revenue)} from ${num(analysis.summary.billableOrders)} billable orders, ` +
      `with a ${pct(analysis.summary.completionRate)} completion rate. ` +
      observations.slice(0, 3).join(" ") +
      ` Recommended next step: ${recommendations[0]}`,
    followups: ["What should we improve based on our data?", "Which branch performed best?", "Show the revenue for last month"],
    grounding: [
      "Observations are generated from computed metrics only, not from the language model.",
      "Recommendations are clearly separated from measured data.",
    ],
  };
}

/* ───────────────────────────── unknown ───────────────────────────── */

function buildUnknown(bounds: DataBounds): BuiltResponse {
  return {
    facts: { note: "The question did not map to an approved analytics topic." },
    kpis: [],
    table: null,
    chart: null,
    range: null,
    fallbackNarrative:
      "I can answer questions about revenue, laundry orders, customers, services, branches and payments using the recorded Spark Clean data. " +
      `The latest recorded order date is ${bounds.max}. Try asking about revenue for a specific month, pending orders, the most popular service, or a period-over-period comparison.`,
    followups: [
      "What is the revenue for the previous month?",
      "How many orders are still pending?",
      "What is our most popular laundry service?",
    ],
    grounding: [],
  };
}

/* ───────────────────────────── entry point ───────────────────────────── */

export async function buildResponse(intent: ParsedIntent, bounds: DataBounds): Promise<BuiltResponse> {
  switch (intent.topic) {
    case "revenue": {
      const trend = await monthlyTrend();
      return buildRevenue(intent, bounds, trend);
    }
    case "compare":
      return buildCompare(intent, bounds);
    case "orders":
      return buildOrders(intent, bounds);
    case "completion":
      return buildCompletion(intent, bounds);
    case "pending":
      return buildPending(intent, bounds);
    case "customers":
      return buildCustomers(intent, bounds);
    case "services":
      return buildServices(intent, bounds);
    case "branches":
      return buildBranches(intent, bounds);
    case "payments":
      return buildPayments(intent, bounds);
    case "performance":
      return buildPerformance(intent, bounds);
    default:
      return buildUnknown(bounds);
  }
}

export { getDataBounds };