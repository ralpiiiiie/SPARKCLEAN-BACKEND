import { z } from "zod";

const paymentMethods = z.enum(["Cash", "GCash", "Maya", "Card"]);
const orderStatuses = z.enum(["Received", "Washing", "Ready", "Delivered", "Cancelled"]);

export const orderCreateSchema = z.object({
  customerId: z.string().min(1),
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  kg: z.number().int().positive(),
  loads: z.number().int().positive(),
  amount: z.number().nonnegative(),
  paymentMethod: paymentMethods,
  status: orderStatuses,
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isPickup: z.boolean().default(false),
});

export const orderUpdateSchema = orderCreateSchema.partial();

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().min(1).optional(),
  branchId: z.string().optional(),
  serviceId: z.string().optional(),
  customerId: z.string().optional(),
  status: orderStatuses.optional(),
  paymentMethod: paymentMethods.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
