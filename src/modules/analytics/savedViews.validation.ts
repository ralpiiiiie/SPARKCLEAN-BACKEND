import { z } from "zod";

export const savedViewCreateSchema = z.object({
  name: z.string().min(1).max(120),
  page: z.string().min(1),
  filtersJson: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().default(false),
});

export const savedViewUpdateSchema = savedViewCreateSchema.partial();

export const savedViewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  pageName: z.string().optional(),
});
