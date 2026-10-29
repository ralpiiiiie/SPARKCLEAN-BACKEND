import { z } from "zod";

const pages = z.enum(["descriptive", "predictive", "prescriptive", "summary"]);
const tags = z.enum(["Insight", "Warning", "Action", "Question"]);

export const noteCreateSchema = z.object({
  page: pages,
  branchId: z.string().min(1).nullable().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tag: tags.default("Insight"),
  pinned: z.boolean().default(false),
  author: z.string().min(1).default("Admin User"),
});

export const noteUpdateSchema = noteCreateSchema.partial();

export const noteQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  sort: z.enum(["createdAt", "updatedAt", "title"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().min(1).optional(),
  pageName: pages.optional(),
  branchId: z.string().optional(),
  pinned: z.coerce.boolean().optional(),
});
