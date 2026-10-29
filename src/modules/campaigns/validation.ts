import { z } from "zod";

const channels = z.enum(["Facebook", "TikTok", "Flyers", "Referral", "Radio", "Promo Code"]);

export const campaignCreateSchema = z.object({
  name: z.string().min(1),
  channel: channels,
  branchId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: z.number().nonnegative(),
  newCustomers: z.number().int().nonnegative(),
  revenueGenerated: z.number().nonnegative(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export const campaignQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().min(1).optional(),
  branchId: z.string().optional(),
  channel: channels.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
