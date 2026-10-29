import { z } from "zod";

export const reportCreateSchema = z.object({
  title: z.string().min(1).max(200),
  snapshotJson: z.record(z.string(), z.unknown()),
});

export const reportUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const reportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().min(1).optional(),
});

export const snapshotCreateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().optional(),
});
