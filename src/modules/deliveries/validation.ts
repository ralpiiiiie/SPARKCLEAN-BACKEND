import { z } from "zod";

const statuses = z.enum(["Completed", "In Transit", "Delayed"]);

export const deliveryCreateSchema = z.object({
  plantId: z.string().min(1),
  branchId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  loads: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  status: statuses,
});

export const deliveryUpdateSchema = deliveryCreateSchema.partial();

export const deliveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().min(1).optional(),
  plantId: z.string().optional(),
  branchId: z.string().optional(),
  status: statuses.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
