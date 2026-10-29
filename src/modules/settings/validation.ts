import { z } from "zod";

export const settingsUpdateSchema = z.object({
  rushCostPerLoad: z.number().nonnegative().optional(),
  storageCostPerLoad: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(8).optional(),
  units: z.string().min(1).max(24).optional(),
  validationMonths: z.number().int().min(1).max(12).optional(),
});
