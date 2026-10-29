import { z } from "zod";

const statuses = z.enum(["Planned", "Dispatched", "Delivered", "Cancelled"]);

export const scheduleItemQuerySchema = z.object({
  scenarioId: z.coerce.number().int().positive().optional(),
  status: statuses.optional(),
});

export const scheduleItemUpdateSchema = z.object({
  loads: z.number().nonnegative().optional(),
  unitCost: z.number().nonnegative().optional(),
  status: statuses.optional(),
  isManualOverride: z.boolean().optional(),
});
