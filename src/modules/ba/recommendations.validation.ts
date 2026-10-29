import { z } from "zod";

const priorities = z.enum(["High", "Medium", "Low"]);
const stages = z.enum(["Descriptive", "Predictive", "Prescriptive"]);
const statuses = z.enum(["Open", "In progress", "Done"]);

export const recommendationCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: priorities,
  relatedStep: stages,
  owner: z.string().min(1).default("Admin User"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: statuses.default("Open"),
  estimatedSavings: z.number().nonnegative().nullable().optional(),
});

export const recommendationUpdateSchema = recommendationCreateSchema.partial();

export const recommendationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  priority: priorities.optional(),
  relatedStep: stages.optional(),
  status: statuses.optional(),
  search: z.string().trim().min(1).optional(),
});
