import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().min(1).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize };
}

export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function dateRangeQuerySchema() {
  return z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });
}

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const textIdParamSchema = z.object({ id: z.string().min(1) });
