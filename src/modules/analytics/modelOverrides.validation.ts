import { z } from "zod";

const models = z.enum(["linear", "quadratic", "cubic", "exponential", "smoothing"]);

export const modelOverrideCreateSchema = z.object({
  branchId: z.string().min(1),
  chosenModel: models,
  reason: z.string().min(1),
  active: z.boolean().default(true),
});

export const modelOverrideUpdateSchema = modelOverrideCreateSchema.partial();

export const modelOverrideQuerySchema = z.object({
  branchId: z.string().optional(),
  active: z.coerce.boolean().optional(),
});
