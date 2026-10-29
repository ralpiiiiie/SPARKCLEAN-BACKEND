import { z } from "zod";

export const costAssumptionCreateSchema = z.object({
  name: z.string().min(1).max(120),
  rushCostPerLoad: z.number().nonnegative(),
  storageCostPerLoad: z.number().nonnegative(),
  isActive: z.boolean().default(false),
});

export const costAssumptionUpdateSchema = costAssumptionCreateSchema.partial();
