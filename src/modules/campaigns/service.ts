import { and, asc, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, marketingCampaigns } from "../../db/schema/index.js";
import type { z } from "zod";
import { offsetOf, pageMeta } from "../../utils/params.js";
import type { campaignCreateSchema, campaignQuerySchema } from "./validation.js";
import { ApiError } from "../../utils/errors.js";
import { nextId } from "../../utils/ids.js";
import { toNumber } from "../../utils/numbers.js";

type CampaignQuery = z.infer<typeof campaignQuerySchema>;

const sortable = {
  id: marketingCampaigns.id,
  name: marketingCampaigns.name,
  channel: marketingCampaigns.channel,
  branch: branches.name,
  startDate: marketingCampaigns.startDate,
  budget: marketingCampaigns.budget,
  newCustomers: marketingCampaigns.newCustomers,
  revenueGenerated: marketingCampaigns.revenueGenerated,
} as const;

const baseQuery = () =>
  db
    .select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      channel: marketingCampaigns.channel,
      branch: branches.name,
      branchId: marketingCampaigns.branchId,
      startDate: marketingCampaigns.startDate,
      endDate: marketingCampaigns.endDate,
      budget: marketingCampaigns.budget,
      newCustomers: marketingCampaigns.newCustomers,
      revenueGenerated: marketingCampaigns.revenueGenerated,
    })
    .from(marketingCampaigns)
    .innerJoin(branches, eq(marketingCampaigns.branchId, branches.id));

type CampaignRow = Awaited<ReturnType<typeof baseQuery>>[number];

const serialize = (row: CampaignRow) => ({
  ...row,
  budget: toNumber(row.budget),
  revenueGenerated: toNumber(row.revenueGenerated),
});

export async function listCampaigns(query: CampaignQuery) {
  const conditions: SQL[] = [];
  if (query.branchId) conditions.push(eq(marketingCampaigns.branchId, query.branchId));
  if (query.channel) conditions.push(eq(marketingCampaigns.channel, query.channel));
  if (query.dateFrom) conditions.push(gte(marketingCampaigns.startDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(marketingCampaigns.endDate, query.dateTo));
  if (query.search) conditions.push(ilike(marketingCampaigns.name, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const column =
    sortable[(query.sort ?? "startDate") as keyof typeof sortable] ?? marketingCampaigns.startDate;

  const [rows, totalRows] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(query.order === "desc" ? desc(column) : asc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(marketingCampaigns).where(where),
  ]);

  return {
    data: rows.map(serialize),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

export async function getCampaign(id: string) {
  const [row] = await baseQuery().where(eq(marketingCampaigns.id, id));
  if (!row) throw ApiError.notFound("Campaign not found");
  return serialize(row);
}

export async function createCampaign(input: z.infer<typeof campaignCreateSchema>) {
  const id = await nextId("marketing_campaigns", "id", "CMP", 4);
  const [created] = await db
    .insert(marketingCampaigns)
    .values({
      ...input,
      id,
      budget: String(input.budget),
      revenueGenerated: String(input.revenueGenerated),
    })
    .returning({ id: marketingCampaigns.id });
  return getCampaign(created.id);
}

export async function updateCampaign(
  id: string,
  patch: Partial<z.infer<typeof campaignCreateSchema>>,
) {
  const { budget, revenueGenerated, ...rest } = patch;
  const values = {
    ...rest,
    ...(budget !== undefined ? { budget: String(budget) } : {}),
    ...(revenueGenerated !== undefined
      ? { revenueGenerated: String(revenueGenerated) }
      : {}),
  };
  const [updated] = await db
    .update(marketingCampaigns)
    .set(values)
    .where(eq(marketingCampaigns.id, id))
    .returning({ id: marketingCampaigns.id });
  if (!updated) throw ApiError.notFound("Campaign not found");
  return getCampaign(id);
}

export async function deleteCampaign(id: string) {
  const [deleted] = await db
    .delete(marketingCampaigns)
    .where(eq(marketingCampaigns.id, id))
    .returning({ id: marketingCampaigns.id });
  if (!deleted) throw ApiError.notFound("Campaign not found");
  return { id: deleted.id, deleted: true };
}
