import { z } from "zod";

const statuses = z.enum(["Not started", "In progress", "Completed"]);

export const procedureRunCreateSchema = z.object({
  monthNo: z.number().int().min(1).max(999),
  periodLabel: z.string().min(1).max(80),
  status: statuses.default("Not started"),
  owner: z.string().min(1).default("Admin User"),
  notes: z.string().nullable().optional(),
});

export const procedureRunUpdateSchema = procedureRunCreateSchema.partial();

export const procedureRunQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: statuses.optional(),
  search: z.string().trim().min(1).optional(),
});

export const procedureStepCreateSchema = z.object({
  stepNo: z.number().int().min(1).max(7),
  title: z.string().min(1).max(160),
  done: z.boolean().default(false),
  note: z.string().nullable().optional(),
});

export const procedureStepUpdateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  done: z.boolean().optional(),
  doneAt: z.string().datetime().nullable().optional(),
  note: z.string().nullable().optional(),
});
