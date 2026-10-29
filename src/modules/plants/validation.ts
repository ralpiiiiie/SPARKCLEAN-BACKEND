import { z } from "zod";

export const plantCreateSchema = z.object({
  id: z.string().regex(/^PL\d{3}$/).optional(),
  name: z.string().min(1),
  city: z.string().min(1),
  monthlyCapacity: z.number().int().positive(),
  lat: z.number(),
  lng: z.number(),
});

export const plantUpdateSchema = plantCreateSchema.partial().omit({ id: true });
