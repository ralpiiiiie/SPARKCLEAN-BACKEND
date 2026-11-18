import { z } from "zod";

export const settingsUpdateSchema = z.object({
  currency: z.string().trim().min(1, "Currency symbol is required.").max(4).optional(),
  machineHoursDefault: z.coerce
    .number()
    .int("Machine hours must be a whole number.")
    .min(200, "Choose at least 200 machine hours.")
    .max(600, "Choose at most 600 machine hours.")
    .optional(),
});
