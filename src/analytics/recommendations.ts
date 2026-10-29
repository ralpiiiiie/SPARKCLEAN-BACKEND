import { forecastBranchWorkloads } from "./forecast.js";

export type RecommendationPriority = "High" | "Medium" | "Low";
export type RecommendationCategory =
  | "Capacity"
  | "Operations"
  | "Marketing"
  | "Retention"
  | "Revenue";

export interface OrderFact {
  customerId: string;
  serviceId: string;
  branchId: string;
  amount: number;
  status: string;
  orderDate: string;
}

export interface DemandFact {
  branchId: string;
  branchName: string;
  monthNo: number;
  loads: number;
}

export interface ServiceFact {
  id: string;
  name: string;
}

export interface DerivedRecommendation {
  id: string;
  category: RecommendationCategory;
  action: string;
  reason: string;
  priority: RecommendationPriority;
  benefit: string;
}

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

function monthKeys(orderDate: string): string {
  return orderDate.slice(0, 7);
}

function continuousKeys(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const sorted = [...new Set(dates.map(monthKeys))].sort();
  const [startYear, startMonth] = sorted[0].split("-").map(Number);
  const [endYear, endMonth] = sorted[sorted.length - 1].split("-").map(Number);
  const keys: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/**
 * Evidence-based actions derived from the recorded data. Mirrors the Phase 1
 * rule engine so seeded recommendations match what the UI already showed.
 */
export function buildRecommendations(input: {
  orders: OrderFact[];
  services: ServiceFact[];
  demand: DemandFact[];
}): DerivedRecommendation[] {
  const { orders, services, demand } = input;
  if (orders.length < 30) return [];

  const recommendations: DerivedRecommendation[] = [];
  const billable = orders.filter((o) => o.status !== "Cancelled");

  const statuses = { completed: 0, pending: 0, inProgress: 0, cancelled: 0 };
  for (const order of orders) {
    if (order.status === "Delivered") statuses.completed += 1;
    else if (order.status === "Received") statuses.pending += 1;
    else if (order.status === "Washing" || order.status === "Ready") statuses.inProgress += 1;
    else if (order.status === "Cancelled") statuses.cancelled += 1;
  }
  const totalOrders = orders.length;
  const cancellationRate = totalOrders ? (statuses.cancelled / totalOrders) * 100 : 0;
  const completionRate = totalOrders ? (statuses.completed / totalOrders) * 100 : 0;
  const openShare = totalOrders
    ? ((statuses.pending + statuses.inProgress) / totalOrders) * 100
    : 0;

  const byCustomer = new Map<string, number>();
  for (const order of billable) {
    byCustomer.set(order.customerId, (byCustomer.get(order.customerId) ?? 0) + 1);
  }
  const uniqueCustomers = byCustomer.size;
  const repeatCustomers = [...byCustomer.values()].filter((n) => n > 1).length;
  const repeatRate = uniqueCustomers ? (repeatCustomers / uniqueCustomers) * 100 : 0;

  const workloads = forecastBranchWorkloads(demand);
  const keys = continuousKeys(orders.map((o) => o.orderDate));
  const totalRevenue = billable.reduce((s, o) => s + o.amount, 0);

  const totalByMonth = new Map<string, number>();
  for (const order of billable) {
    const key = monthKeys(order.orderDate);
    totalByMonth.set(key, (totalByMonth.get(key) ?? 0) + order.amount);
  }
  const last3 = keys.slice(-3).reduce((s, k) => s + (totalByMonth.get(k) ?? 0), 0);
  const prev3 = keys
    .slice(Math.max(0, keys.length - 6), Math.max(0, keys.length - 3))
    .reduce((s, k) => s + (totalByMonth.get(k) ?? 0), 0);
  const revenueChangePct = prev3 ? ((last3 - prev3) / prev3) * 100 : 0;

  const recentKeys = new Set(keys.slice(-6));
  const priorKeys = new Set(keys.slice(-12, -6));
  const shifts = new Map<string, { recent: number; prior: number }>();
  for (const order of billable) {
    const key = monthKeys(order.orderDate);
    const entry = shifts.get(order.serviceId) ?? { recent: 0, prior: 0 };
    if (recentKeys.has(key)) entry.recent += 1;
    else if (priorKeys.has(key)) entry.prior += 1;
    shifts.set(order.serviceId, entry);
  }
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const serviceStats = [...shifts.entries()].map(([id, s]) => ({
    id,
    name: serviceName.get(id) ?? id,
    recentOrders: s.recent,
    priorOrders: s.prior,
    changePct: s.prior ? ((s.recent - s.prior) / s.prior) * 100 : null,
  }));

  const risingBranch = workloads
    .filter((w) => w.changePct >= 5)
    .sort((a, b) => b.changePct - a.changePct)[0];
  if (risingBranch) {
    recommendations.push({
      id: "capacity-rising-branch",
      category: "Capacity",
      action: `Plan extra staffing and plant capacity for ${risingBranch.branch} next month.`,
      reason: `${risingBranch.branch} is estimated to handle about ${risingBranch.forecastLoads.toLocaleString()} loads next month — roughly ${risingBranch.changePct.toFixed(0)}% above its latest recorded month.`,
      priority: risingBranch.changePct >= 10 ? "High" : "Medium",
      benefit: "Keeps turnaround times steady during the projected peak instead of letting queues build.",
    });
  }

  const busiest = workloads[0];
  if (busiest && busiest.branch !== risingBranch?.branch) {
    recommendations.push({
      id: "capacity-busiest-branch",
      category: "Capacity",
      action: `Keep ${busiest.branch} fully staffed through its next demand cycle.`,
      reason: `${busiest.branch} carries the highest expected workload next month, at about ${busiest.forecastLoads.toLocaleString()} loads.`,
      priority: "Medium",
      benefit: "Protects the branch that handles the largest share of laundry volume.",
    });
  }

  if (cancellationRate >= 8) {
    recommendations.push({
      id: "operations-cancellations",
      category: "Operations",
      action: "Review order confirmation and pickup scheduling to reduce cancellations.",
      reason: `${statuses.cancelled.toLocaleString()} of ${totalOrders.toLocaleString()} orders were cancelled (${cancellationRate.toFixed(0)}%).`,
      priority: cancellationRate >= 12 ? "High" : "Medium",
      benefit: "Recovering cancelled orders adds billable volume without extra acquisition spend.",
    });
  }

  if (openShare >= 25) {
    recommendations.push({
      id: "operations-backlog",
      category: "Operations",
      action: "Prioritise clearing orders that are still pending or in progress.",
      reason: `${(statuses.pending + statuses.inProgress).toLocaleString()} orders (${openShare.toFixed(0)}%) are still pending or in progress, while ${completionRate.toFixed(0)}% of all orders are marked delivered.`,
      priority: openShare >= 40 ? "High" : "Medium",
      benefit: "Faster completion shortens the order cycle and lifts customer confidence.",
    });
  }

  const decliningService = serviceStats
    .filter(
      (s) =>
        s.changePct !== null &&
        s.changePct < -5 &&
        s.priorOrders >= 5,
    )
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))[0];
  if (decliningService) {
    recommendations.push({
      id: "flag-declining-service",
      category: "Marketing",
      action: `Investigate the drop in ${decliningService.name} orders and consider a targeted promotion.`,
      reason: `${decliningService.name} moved from ${decliningService.priorOrders} to ${decliningService.recentOrders} orders between the two latest six-month windows (${Math.abs(decliningService.changePct ?? 0).toFixed(0)}% lower).`,
      priority: "Medium",
      benefit: "Catches a slipping service line before it loses more of its revenue share.",
    });
  }

  const risingService = serviceStats
    .filter((s) => s.changePct !== null && s.changePct > 5 && s.recentOrders >= 5)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))[0];
  if (risingService) {
    recommendations.push({
      id: "capacity-rising-service",
      category: "Capacity",
      action: `Make sure ${risingService.name} capacity keeps pace with its growing demand.`,
      reason: `${risingService.name} rose from ${risingService.priorOrders} to ${risingService.recentOrders} orders between the two latest six-month windows (${(risingService.changePct ?? 0).toFixed(0)}% higher).`,
      priority: "Medium",
      benefit: "Prevents a popular service from becoming a bottleneck as demand grows.",
    });
  }

  if (repeatRate < 45) {
    recommendations.push({
      id: "retention-repeat",
      category: "Retention",
      action: "Introduce a repeat-order incentive for one-time customers.",
      reason: `Only ${repeatRate.toFixed(0)}% of customers (${repeatCustomers.toLocaleString()} of ${uniqueCustomers.toLocaleString()}) have placed more than one order.`,
      priority: "Medium",
      benefit: "Repeat visits reduce reliance on acquiring new customers each period.",
    });
  } else {
    recommendations.push({
      id: "retention-loyalty",
      category: "Retention",
      action: "Reward loyal customers to protect repeat volume.",
      reason: `${repeatRate.toFixed(0)}% of customers (${repeatCustomers.toLocaleString()} of ${uniqueCustomers.toLocaleString()}) have placed more than one order.`,
      priority: "Low",
      benefit: "Sustains the repeat base that already drives most order volume.",
    });
  }

  if (revenueChangePct <= -5) {
    recommendations.push({
      id: "revenue-decline",
      category: "Revenue",
      action: "Review pricing, service mix and branch demand behind the recent revenue dip.",
      reason: `Revenue across the latest three recorded months is ${Math.abs(revenueChangePct).toFixed(0)}% below the previous three months.`,
      priority: revenueChangePct <= -15 ? "High" : "Medium",
      benefit: "Identifies whether volume, mix or pricing is driving the decline before it continues.",
    });
  }

  const decliningBranch = workloads
    .filter((w) => w.changePct <= -5)
    .sort((a, b) => a.changePct - b.changePct)[0];
  if (decliningBranch) {
    recommendations.push({
      id: "flag-declining-branch",
      category: "Revenue",
      action: `Review demand and marketing coverage for ${decliningBranch.branch}.`,
      reason: `${decliningBranch.branch} is projected at about ${decliningBranch.forecastLoads.toLocaleString()} loads next month, ${Math.abs(decliningBranch.changePct).toFixed(0)}% below its latest recorded month.`,
      priority: "Medium",
      benefit: "Surfaces a softening location while there is still time to act on it.",
    });
  }

  // Keep the revenue figure referenced so the engine reflects real totals even
  // when no revenue rule fires.
  if (recommendations.length === 0 && totalRevenue > 0) {
    recommendations.push({
      id: "operations-monitor",
      category: "Operations",
      action: "Keep monitoring order quality while volume is stable.",
      reason: `${billable.length.toLocaleString()} billable orders worth roughly ₱${Math.round(totalRevenue).toLocaleString()} are on record.`,
      priority: "Low",
      benefit: "Maintains service quality as the customer base grows.",
    });
  }

  return recommendations
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, 6);
}
