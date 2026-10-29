import { z } from "zod";

export const deliveryCostCreateSchema = z.object({
  plantId: z.string().min(1),
  branchId: z.string().min(1),
  costPerLoad: z.number().nonnegative(),
  distanceKm: z.number().int().nonnegative(),
});

export const deliveryCostUpdateSchema = deliveryCostCreateSchema.partial();

export const deliveryCostQuerySchema = z.object({
  plantId: z.string().optional(),
  branchId: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});
