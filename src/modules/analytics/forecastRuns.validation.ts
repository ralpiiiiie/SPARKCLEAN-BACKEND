import { z } from "zod";

const models = z.enum(["linear", "quadratic", "cubic", "exponential", "smoothing", "auto"]);
const statuses = z.enum(["Draft", "Approved", "Archived"]);

export const forecastRunCreateSchema = z.object({
  name: z.string().min(1).max(160),
  branchId: z.string().min(1),
  model: models.default("auto"),
  horizon: z.number().int().min(1).max(6).default(3),
  validationMonths: z.number().int().min(1).max(12).default(3),
  notes: z.string().optional(),
});

export const forecastRunUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  status: statuses.optional(),
  notes: z.string().nullable().optional(),
});

export const forecastRunQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  branchId: z.string().optional(),
  status: statuses.optional(),
  model: models.optional(),
  search: z.string().trim().min(1).optional(),
});

export const forecastQuerySchema = z.object({
  branchId: z.string().min(1),
  model: models.default("auto"),
  horizon: z.coerce.number().int().min(1).max(12).default(3),
  validationMonths: z.coerce.number().int().min(1).max(12).default(3),
});
