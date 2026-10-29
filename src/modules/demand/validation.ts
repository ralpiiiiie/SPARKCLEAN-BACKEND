import { z } from "zod";

export const demandCreateSchema = z.object({
  branchId: z.string().min(1),
  monthNo: z.number().int().min(1).max(999),
  loads: z.number().int().nonnegative(),
  monthLabel: z.string().regex(/^\d{4}-\d{2}$/),
});

export const demandUpdateSchema = demandCreateSchema.partial();

export const demandQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(500),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().min(1).optional(),
  branchId: z.string().optional(),
  monthFrom: z.coerce.number().int().min(1).optional(),
  monthTo: z.coerce.number().int().min(1).optional(),
});
