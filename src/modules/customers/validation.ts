import { z } from "zod";

const customerTypes = z.enum(["Individual", "Condo", "Dormitory", "Hotel", "Restaurant", "Clinic"]);
const loyaltyTiers = z.enum(["Bronze", "Silver", "Gold", "Platinum"]);

export const customerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email(),
  address: z.string().min(1),
  branchId: z.string().min(1),
  type: customerTypes,
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  loyaltyTier: loyaltyTiers,
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().min(1).optional(),
  branchId: z.string().optional(),
  type: customerTypes.optional(),
  loyaltyTier: loyaltyTiers.optional(),
});
