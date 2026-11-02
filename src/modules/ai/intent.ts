/**
 * Deterministic natural-language intent parser.
 *
 * Relative dates are resolved against the latest recorded order date (the same
 * anchor the dashboard uses), never the wall clock, so answers describe the
 * period the app is actually showing. Anything that cannot be mapped to an
 * approved topic falls back to `unknown` — the assistant then explains what it
 * can answer instead of inventing data.
 */
import {
  type DataBounds,
  type DateRange,
  type Preset,
  clampRange,
  isoAddDays,
  monthRange,
  previousMonthKey,
  resolvePreset,
} from "./dataService.js";

export type Topic =
  | "compare"
  | "performance"
  | "customers"
  | "services"
  | "branches"
  | "payments"
  | "completion"
  | "pending"
  | "revenue"
  | "orders"
  | "unknown";

export interface BranchRef {
  id: string;
  name: string;
  city: string;
}

export interface ParseContext {
  lastRange?: DateRange;
  lastTopic?: Topic;
}

export interface ParsedIntent {
  topic: Topic;
  range: DateRange;
  rangeLabel?: string;
  compare?: { current: DateRange; previous: DateRange };
  branchId: string | null;
  branchName: string | null;
  /** Every branch named in the question (deduplicated). Used for access checks. */
  branchIds: string[];
  explicitPeriod: boolean;
  preset: Preset | "explicit" | "context";
  monthKey: string | null;
  flags: {
    bestMonth: boolean;
    worstMonth: boolean;
    trend: boolean;
    unusual: boolean;
    recommendation: boolean;
    mostPopular: boolean;
    leastPopular: boolean;
    dormant: boolean;
    topCustomers: boolean;
  };
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const has = (text: string, ...terms: string[]) => terms.some((term) => text.includes(term));

function detectPreset(text: string): Preset | null {
  if (has(text, "today")) return "today";
  if (has(text, "yesterday")) return "yesterday";
  if (has(text, "this week", "current week", "past 7 days", "last 7 days", "seven days", "weekly")) {
    return "this_week";
  }
  if (has(text, "last week", "previous week", "prior week")) return "last_week";
  if (has(text, "this month", "current month", "month to date", "mtd")) return "this_month";
  if (
    has(
      text,
      "last month",
      "previous month",
      "prior month",
      "past month",
      "the month before",
      "month before that",
    )
  ) {
    return "last_month";
  }
  if (has(text, "15 days", "fifteen days", "last 15", "past 15")) return "last_15_days";
  if (has(text, "30 days", "thirty days", "last 30", "past 30")) return "last_30_days";
  if (has(text, "this year", "current year", "year to date", "ytd", "annual")) return "this_year";
  if (has(text, "last year", "previous year", "prior year")) return "last_year";
  if (has(text, "all time", "all-time", "overall", "since the beginning", "entire history")) {
    return "all_time";
  }
  return null;
}

function detectExplicitMonth(text: string, bounds: DataBounds): string | null {
  // ISO month: 2024-12
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  // "December 2024" / "Dec '24" / "Dec 24"
  for (const [name, month] of Object.entries(MONTH_NAMES)) {
    const pattern = new RegExp(`\\b${name}\\b(?:[\\s,'-]*(20\\d{2}|'?\\d{2}))?`, "i");
    const match = text.match(pattern);
    if (match) {
      let year = bounds.max.slice(0, 4);
      if (match[1]) {
        const raw = match[1].replace("'", "");
        year = raw.length === 2 ? `20${raw}` : raw;
      }
      return `${year}-${String(month).padStart(2, "0")}`;
    }
  }
  return null;
}

function detectIsoRange(text: string): DateRange | null {
  const match = text.match(
    /\b(20\d{2}-\d{2}-\d{2})\b\s*(?:to|until|through|–|-|and)\s*\b(20\d{2}-\d{2}-\d{2})\b/,
  );
  if (match && match[1] <= match[2]) return { start: match[1], end: match[2] };
  return null;
}

/** The comparable period immediately before `range` (calendar month or equal span). */
function precedingRange(range: DateRange): DateRange {
  const isWholeMonth =
    range.start.endsWith("-01") &&
    range.start.slice(0, 7) !== range.end.slice(0, 7) &&
    range.end ===
      new Date(Date.UTC(Number(range.end.slice(0, 4)), Number(range.end.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10);
  if (isWholeMonth) {
    const prev = previousMonthKey(range.start.slice(0, 7));
    const end = new Date(Date.UTC(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10);
    return { start: `${prev}-01`, end };
  }
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${range.end}T00:00:00.000Z`).getTime() -
        new Date(`${range.start}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const end = isoAddDays(range.start, -1);
  return { start: isoAddDays(end, -(days - 1)), end };
}

/** All branches referenced by name or city, in the order they appear. */
export function detectBranches(text: string, branches: BranchRef[]): BranchRef[] {
  const sorted = [...branches].sort((a, b) => b.name.length - a.name.length);
  const found: Array<{ branch: BranchRef; at: number }> = [];
  for (const branch of sorted) {
    const name = branch.name.toLowerCase();
    const city = branch.city.toLowerCase();
    // Also recognise the branch code (BR002, BR004, …) so a manager cannot
    // sidestep the refusal rules by naming another branch by id.
    const idMatch = new RegExp(`\\b${branch.id.toLowerCase()}\\b`).exec(text);
    const at = Math.min(
      name && text.indexOf(name) !== -1 ? text.indexOf(name) : Number.POSITIVE_INFINITY,
      city && text.indexOf(city) !== -1 ? text.indexOf(city) : Number.POSITIVE_INFINITY,
      idMatch ? idMatch.index : Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(at)) found.push({ branch, at });
  }
  // Drop a shorter name that is part of a longer match (e.g. "Cebu City" vs "Cebu").
  return found
    .sort((a, b) => a.at - b.at)
    .filter((entry, index, all) =>
      all.every((other, otherIndex) => otherIndex === index || !other.branch.name.includes(entry.branch.name)),
    )
    .map((entry) => entry.branch);
}

function detectTopic(text: string): Topic {
  const compareWords = has(
    text,
    "compare",
    "comparison",
    "versus",
    " vs ",
    "difference between",
    "how does",
    "against",
  );
  if (compareWords && has(text, "month", "week", "year", "quarter", "period", "last", "previous", "this")) {
    return "compare";
  }

  if (
    has(
      text,
      "unusual",
      "anomaly",
      "anomalies",
      "what should we improve",
      "what can we improve",
      "how are we doing",
      "how is the business",
      "overall performance",
      "business performance",
      "business doing",
      "major changes",
      "what changed",
      "health",
      "recommendation",
      "recommendations",
      "suggest",
      "advice",
      "insight",
      "summary of the business",
    )
  ) {
    return "performance";
  }

  if (
    has(
      text,
      "customer",
      "customers",
      "client",
      "clients",
      "loyal",
      "loyalty",
      "retention",
      "retain",
      "dormant",
      "inactive",
      "frequent",
      "repeat",
      "regular",
      "churn",
    )
  ) {
    return "customers";
  }

  if (
    has(
      text,
      "service",
      "services",
      "popular",
      "most requested",
      "demand for",
      "wash & fold",
      "wash and fold",
      "dry clean",
      "dry-clean",
      "express",
      "bundle",
      "offer",
      "package",
      "product",
    )
  ) {
    return "services";
  }

  if (has(text, "branch", "branches", "outlet", "location", "store", "site", "cebu city", "mandaue", "lapu-lapu", "talisay", "consolacion", "minglanilla")) {
    return "branches";
  }

  if (has(text, "payment", "payments", "gcash", "maya", "cash", "card", "method", "collect", "collected", "receivable", "unpaid", "paid")) {
    return "payments";
  }

  if (
    has(
      text,
      "completion rate",
      "completed",
      "completion",
      "cancel rate",
      "cancellation",
      "cancelled rate",
      "canceled rate",
      "success rate",
    )
  ) {
    return "completion";
  }

  if (
    has(
      text,
      "pending",
      "in progress",
      "in-progress",
      "washing",
      "ready",
      "queue",
      "backlog",
      "unfinished",
      "still processing",
      "outstanding",
      "open orders",
    )
  ) {
    return "pending";
  }

  if (
    has(
      text,
      "revenue",
      "sales",
      "income",
      "earn",
      "earning",
      "earnings",
      "turnover",
      "gross",
      "peso",
      "₱",
      "average order",
      "aov",
      "ticket size",
      "how much money",
    )
  ) {
    return "revenue";
  }

  if (has(text, "order", "orders", "volume", "how many", "loads", "transactions", "jobs")) {
    return "orders";
  }

  return "unknown";
}

function buildCompare(text: string, bounds: DataBounds): { current: DateRange; previous: DateRange } {
  const preset = detectPreset(text);

  if (preset === "this_week") {
    const current = resolvePreset("this_week", bounds);
    return { current, previous: resolvePreset("last_week", bounds) };
  }
  if (preset === "last_15_days") {
    const current = resolvePreset("last_15_days", bounds);
    const previousEnd = isoAddDays(current.start, -1);
    return { current, previous: { start: isoAddDays(previousEnd, -14), end: previousEnd } };
  }
  if (preset === "last_30_days") {
    const current = resolvePreset("last_30_days", bounds);
    const previousEnd = isoAddDays(current.start, -1);
    return { current, previous: { start: isoAddDays(previousEnd, -29), end: previousEnd } };
  }
  if (preset === "this_year") {
    return { current: resolvePreset("this_year", bounds), previous: resolvePreset("last_year", bounds) };
  }
  if (preset === "last_year") {
    const current = resolvePreset("last_year", bounds);
    const previous = resolvePreset("last_year", { ...bounds, max: `${Number(bounds.max.slice(0, 4)) - 1}-12-31` });
    return { current, previous };
  }
  if (preset === "this_month" || preset === "last_month" || preset === null) {
    const anchorMonth = preset === "last_month" ? previousMonthKey(bounds.max.slice(0, 7)) : bounds.max.slice(0, 7);
    return {
      current: monthRange(anchorMonth, bounds),
      previous: monthRange(previousMonthKey(anchorMonth), bounds),
    };
  }
  const current = resolvePreset(preset, bounds);
  return { current, previous: resolvePreset("last_month", bounds) };
}

export function parseIntent(
  rawQuestion: string,
  bounds: DataBounds,
  branches: BranchRef[],
  context: ParseContext = {},
): ParsedIntent {
  const text = ` ${rawQuestion.toLowerCase().replace(/\s+/g, " ")} `;

  const mentioned = detectBranches(text, branches);
  const branch = mentioned.length === 1 ? mentioned[0] : null;
  const branchIds = mentioned.map((b) => b.id);
  // Naming two or more branches is a branch comparison regardless of the wording.
  const topic = mentioned.length > 1 ? "branches" : detectTopic(text);
  const flags = {
    bestMonth: has(text, "highest", "best", "peak", "top month", "strongest", "maximum", "max "),
    worstMonth: has(text, "lowest", "worst", "weakest", "minimum", "slowest"),
    trend: has(text, "trend", "over time", "pattern", "trends", "over the last", "trajectory"),
    unusual: has(text, "unusual", "anomaly", "anomalies", "spike", "drop", "sudden", "outlier"),
    recommendation: has(text, "should", "improve", "recommend", "suggest", "advice", "optimize", "opportunity"),
    mostPopular: has(text, "most popular", "most requested", "top service", "best service", "popular"),
    leastPopular: has(text, "fewest", "least popular", "lowest demand", "least requested", "worst service"),
    dormant: has(text, "dormant", "inactive", "not placed", "haven't ordered", "have not ordered", "no recent", "lapsed", "churn"),
    topCustomers: has(text, "most frequent", "top customer", "top customers", "best customer", "biggest customer", "loyal customer"),
  };

  const isoRange = detectIsoRange(text);
  if (isoRange) {
    return {
      topic: topic === "unknown" ? "revenue" : topic,
      range: clampRange(isoRange, bounds),
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      branchIds,
      explicitPeriod: true,
      preset: "explicit",
      monthKey: null,
      flags,
    };
  }

  if (topic === "compare") {
    // "Compare it with the month before that" refers to the period under
    // discussion, not to "last month" relative to today.
    const refersBack = /\b(compare (it|that|this)|with that|against that|than that)\b/.test(text);
    const compare =
      refersBack && context.lastRange
        ? { current: context.lastRange, previous: precedingRange(context.lastRange) }
        : buildCompare(text, bounds);
    return {
      topic,
      range: compare.current,
      compare,
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      branchIds,
      explicitPeriod: true,
      preset: "explicit",
      monthKey: compare.current.start.slice(0, 7),
      flags,
    };
  }

  const monthKey = detectExplicitMonth(text, bounds);
  if (monthKey) {
    return {
      topic: topic === "unknown" ? "revenue" : topic,
      range: clampRange(monthRange(monthKey, bounds), bounds),
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      branchIds,
      explicitPeriod: true,
      preset: "explicit",
      monthKey,
      flags,
    };
  }

  const preset = detectPreset(text);
  if (preset) {
    return {
      topic: topic === "unknown" ? "revenue" : topic,
      range: resolvePreset(preset, bounds),
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      branchIds,
      explicitPeriod: true,
      preset,
      monthKey: null,
      flags,
    };
  }

  // Follow-up: reuse the previously discussed period when the question is vague
  // ("compare it with the month before that", "and the orders?").
  if (context.lastRange) {
    return {
      topic: topic === "unknown" ? (context.lastTopic ?? "revenue") : topic,
      range: context.lastRange,
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      branchIds,
      explicitPeriod: false,
      preset: "context",
      monthKey: null,
      flags,
    };
  }

  // Questions about overall popularity / ranking / all-time peaks refer to the
  // whole recorded history rather than a single month.
  const wantsAllTime =
    flags.bestMonth ||
    flags.worstMonth ||
    topic === "services" ||
    topic === "customers" ||
    topic === "branches";

  return {
    topic,
    range: resolvePreset(wantsAllTime ? "all_time" : "this_month", bounds),
    branchId: branch?.id ?? null,
    branchName: branch?.name ?? null,
    branchIds,
    explicitPeriod: false,
    preset: wantsAllTime ? "all_time" : "this_month",
    monthKey: null,
    flags,
  };
}
