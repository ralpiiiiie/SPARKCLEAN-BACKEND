import { z } from "zod";

export const branchCreateSchema = z.object({
  id: z.string().regex(/^BR\d{3}$/).optional(),
  name: z.string().min(1),
  city: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  manager: z.string().min(1),
});

export const branchUpdateSchema = branchCreateSchema.partial().omit({ id: true });
