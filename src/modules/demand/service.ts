import { and, asc, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branchMonthlyDemand, branches } from "../../db/schema/index.js";
import type { z } from "zod";
import { offsetOf, pageMeta } from "../../utils/params.js";
import type { demandCreateSchema, demandQuerySchema } from "./validation.js";
import { ApiError } from "../../utils/errors.js";

type DemandQuery = z.infer<typeof demandQuerySchema>;

const sortable = {
  branch: branches.name,
  monthNo: branchMonthlyDemand.monthNo,
  loads: branchMonthlyDemand.loads,
  monthLabel: branchMonthlyDemand.monthLabel,
} as const;

const baseQuery = () =>
  db
    .select({
      id: branchMonthlyDemand.id,
      branch: branches.name,
      branchId: branchMonthlyDemand.branchId,
      monthNo: branchMonthlyDemand.monthNo,
      loads: branchMonthlyDemand.loads,
      monthLabel: branchMonthlyDemand.monthLabel,
    })
    .from(branchMonthlyDemand)
    .innerJoin(branches, eq(branchMonthlyDemand.branchId, branches.id));

export async function listDemand(query: DemandQuery) {
  const conditions: SQL[] = [];
  if (query.branchId) conditions.push(eq(branchMonthlyDemand.branchId, query.branchId));
  if (query.monthFrom) conditions.push(gte(branchMonthlyDemand.monthNo, query.monthFrom));
  if (query.monthTo) conditions.push(lte(branchMonthlyDemand.monthNo, query.monthTo));
  if (query.search) {
    conditions.push(ilike(branches.name, `%${query.search}%`));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const column =
    sortable[(query.sort ?? "monthNo") as keyof typeof sortable] ?? branchMonthlyDemand.monthNo;

  const [rows, totalRows] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column), asc(branches.name))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(branchMonthlyDemand).where(where),
  ]);

  return { data: rows, ...pageMeta(totalRows[0].value, query.page, query.pageSize) };
}

export async function getDemand(id: number) {
  const [row] = await baseQuery().where(eq(branchMonthlyDemand.id, id));
  if (!row) throw ApiError.notFound("Demand record not found");
  return row;
}

export async function createDemand(input: z.infer<typeof demandCreateSchema>) {
  const [created] = await db
    .insert(branchMonthlyDemand)
    .values(input)
    .returning({ id: branchMonthlyDemand.id });
  return getDemand(created.id);
}

export async function updateDemand(
  id: number,
  patch: Partial<z.infer<typeof demandCreateSchema>>,
) {
  const [updated] = await db
    .update(branchMonthlyDemand)
    .set(patch)
    .where(eq(branchMonthlyDemand.id, id))
    .returning({ id: branchMonthlyDemand.id });
  if (!updated) throw ApiError.notFound("Demand record not found");
  return getDemand(id);
}

export async function deleteDemand(id: number) {
  const [deleted] = await db
    .delete(branchMonthlyDemand)
    .where(eq(branchMonthlyDemand.id, id))
    .returning({ id: branchMonthlyDemand.id });
  if (!deleted) throw ApiError.notFound("Demand record not found");
  return { id: deleted.id, deleted: true };
}
