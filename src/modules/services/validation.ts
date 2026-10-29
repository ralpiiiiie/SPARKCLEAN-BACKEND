import { z } from "zod";

export const serviceCreateSchema = z.object({
  id: z.string().regex(/^SV\d{3}$/).optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  pricePerKg: z.number().nonnegative(),
  turnaroundHours: z.number().int().positive(),
});

export const serviceUpdateSchema = serviceCreateSchema.partial().omit({ id: true });
