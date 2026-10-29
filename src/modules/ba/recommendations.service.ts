import { and, asc, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import {
  baRecommendations,
  branchMonthlyDemand,
  branches,
  orders,
  services,
} from "../../db/schema/index.js";
import { buildRecommendations, type RecommendationCategory } from "../../analytics/recommendations.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import { toNumber } from "../../utils/numbers.js";
import type {
  recommendationCreateSchema,
  recommendationQuerySchema,
} from "./recommendations.validation.js";

type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
type RecommendationCreate = z.infer<typeof recommendationCreateSchema>;

const STAGE_BY_CATEGORY: Record<RecommendationCategory, "Descriptive" | "Predictive" | "Prescriptive"> = {
  Capacity: "Predictive",
  Operations: "Descriptive",
  Marketing: "Prescriptive",
  Retention: "Prescriptive",
  Revenue: "Prescriptive",
};

const serialize = (row: typeof baRecommendations.$inferSelect) => ({
  ...row,
  estimatedSavings: row.estimatedSavings === null ? null : toNumber(row.estimatedSavings),
});

export async function listRecommendations(query: RecommendationQuery) {
  const conditions: SQL[] = [];
  if (query.priority) conditions.push(eq(baRecommendations.priority, query.priority));
  if (query.relatedStep) conditions.push(eq(baRecommendations.relatedStep, query.relatedStep));
  if (query.status) conditions.push(eq(baRecommendations.status, query.status));
  if (query.search) conditions.push(ilike(baRecommendations.title, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(baRecommendations)
      .where(where)
      .orderBy(asc(baRecommendations.priority), desc(baRecommendations.createdAt))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(baRecommendations).where(where),
  ]);
  return {
    data: rows.map(serialize),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getRecommendation(id: number) {
  const [row] = await db
    .select()
    .from(baRecommendations)
    .where(eq(baRecommendations.id, id));
  if (!row) throw ApiError.notFound("Recommendation not found");
  return serialize(row);
}

export async function createRecommendation(input: RecommendationCreate) {
  const [created] = await db
    .insert(baRecommendations)
    .values({
      ...input,
      dueDate: input.dueDate ?? null,
      estimatedSavings:
        input.estimatedSavings === null || input.estimatedSavings === undefined
          ? null
          : String(input.estimatedSavings),
    })
    .returning({ id: baRecommendations.id });
  return getRecommendation(created.id);
}

export async function updateRecommendation(
  id: number,
  patch: Partial<RecommendationCreate>,
) {
  const { estimatedSavings, ...rest } = patch;
  const [updated] = await db
    .update(baRecommendations)
    .set({
      ...rest,
      ...(estimatedSavings !== undefined
        ? {
            estimatedSavings: estimatedSavings === null ? null : String(estimatedSavings),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(baRecommendations.id, id))
    .returning({ id: baRecommendations.id });
  if (!updated) throw ApiError.notFound("Recommendation not found");
  return getRecommendation(id);
}

export async function deleteRecommendation(id: number) {
  const [deleted] = await db
    .delete(baRecommendations)
    .where(eq(baRecommendations.id, id))
    .returning({ id: baRecommendations.id });
  if (!deleted) throw ApiError.notFound("Recommendation not found");
  return { id: deleted.id, deleted: true };
}

/** Live suggestions from the rule engine; not persisted until the user adds one. */
export async function suggestions() {
  const [orderRows, serviceRows, demandRows] = await Promise.all([
    db
      .select({
        customerId: orders.customerId,
        serviceId: orders.serviceId,
        branchId: orders.branchId,
        amount: orders.amount,
        status: orders.status,
        orderDate: orders.orderDate,
      })
      .from(orders),
    db.select({ id: services.id, name: services.name }).from(services),
    db
      .select({
        branchId: branchMonthlyDemand.branchId,
        branchName: branches.name,
        monthNo: branchMonthlyDemand.monthNo,
        loads: branchMonthlyDemand.loads,
      })
      .from(branchMonthlyDemand)
      .innerJoin(branches, eq(branchMonthlyDemand.branchId, branches.id)),
  ]);

  return buildRecommendations({
    orders: orderRows.map((row) => ({ ...row, amount: toNumber(row.amount) })),
    services: serviceRows,
    demand: demandRows,
  }).map((item) => ({
    id: item.id,
    title: item.action,
    description: item.reason,
    benefit: item.benefit,
    category: item.category,
    priority: item.priority,
    relatedStep: STAGE_BY_CATEGORY[item.category] ?? "Prescriptive",
  }));
}
