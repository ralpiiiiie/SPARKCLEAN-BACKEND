import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  machineUsageLog,
  marketingCampaigns,
  payments,
} from "../../db/schema/index.js";
import { round2, toNumber } from "../../utils/numbers.js";
import { descriptive, recentOrders } from "../analytics/service.js";

/** Safely execute a query, returning a default value on failure (e.g., missing table). */
async function safeQuery<T>(query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    // Log but don't throw — allows dashboard to degrade gracefully if a table is missing
    // (e.g., production DB on older schema). The error is logged for diagnostics.
    console.warn("Dashboard query failed, using fallback:", error instanceof Error ? error.message : error);
    return fallback;
  }
}

export async function dashboard() {
  const [overview, paymentRows, usageRows, campaignRows, latestOrders] = await Promise.all([
    descriptive(),
    safeQuery(
      db
        .select({
          method: payments.method,
          value: sql<number>`sum(${payments.amount})::float`,
        })
        .from(payments)
        .groupBy(payments.method),
      [],
    ),
    safeQuery(
      db
        .select()
        .from(machineUsageLog)
        .orderBy(machineUsageLog.day),
      [],
    ),
    safeQuery(
      db
        .select({
          channel: marketingCampaigns.channel,
          leads: sql<number>`sum(${marketingCampaigns.leads})::int`,
          cost: sql<number>`sum(${marketingCampaigns.cost})::float`,
        })
        .from(marketingCampaigns)
        .groupBy(marketingCampaigns.channel),
      [],
    ),
    recentOrders(8),
  ]);

  const totalUsed = round2(
    usageRows.reduce((sum, row) => sum + toNumber(row.hoursUsed), 0),
  );
  const totalAvailable = round2(
    usageRows.reduce((sum, row) => sum + toNumber(row.hoursAvailable), 0),
  );

  return {
    kpis: overview.kpis,
    monthlySales: overview.monthlySales,
    paymentMix: paymentRows
      .map((row) => ({ method: row.method, value: round2(row.value) }))
      .sort((a, b) => b.value - a.value),
    machineHours: {
      totalUsed,
      totalAvailable,
      utilization: totalAvailable > 0 ? round2((totalUsed / totalAvailable) * 100) : 0,
      series: usageRows.slice(-14).map((row) => ({
        day: row.day,
        used: toNumber(row.hoursUsed),
        available: toNumber(row.hoursAvailable),
      })),
    },
    marketing: campaignRows
      .map((row) => ({
        channel: row.channel,
        leads: row.leads,
        cost: round2(row.cost),
      }))
      .sort((a, b) => b.leads - a.leads),
    recentOrders: latestOrders,
  };
}
