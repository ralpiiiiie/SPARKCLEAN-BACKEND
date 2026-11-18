import { z } from "zod";
import { listQuerySchema } from "../../utils/params.js";

export const BARANGAYS = [
  "Gabi",
  "Day-as",
  "Poblacion",
  "Catarman",
  "Pilipog",
  "Ibabao",
  "San Miguel",
  "Bangbang",
  "Buagsong",
  "Cogon",
  "Alegria",
  "Gilutongan",
  "Dapitan",
] as const;

export const CUSTOMER_TYPES = ["Student", "Household", "Boarding house", "Business"] as const;
export const PAYMENT_METHODS = ["Cash", "GCash", "Maya"] as const;
export const CAMPAIGN_CHANNELS = [
  "Facebook",
  "Flyers",
  "Referral",
  "Tarpaulin",
  "Promo",
] as const;

const id = z.string().min(1, "An identifier is required.");

/* Customers */
export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(120),
  barangay: z.enum(BARANGAYS, { message: "Choose a Cordova barangay from the list." }),
  type: z.enum(CUSTOMER_TYPES, { message: "Choose a valid customer type." }),
});
export const customerUpdateSchema = customerCreateSchema.partial();
export const customerQuerySchema = listQuerySchema.extend({
  barangay: z.enum(BARANGAYS).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
});

/* Services */
export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, "Service name is required.").max(80),
  unitLabel: z.string().trim().min(1, "Unit label is required.").max(20),
  price: z.coerce.number().min(0, "Price cannot be negative."),
  cost: z.coerce.number().min(0, "Cost cannot be negative."),
  machineHoursPerUnit: z.coerce.number().min(0, "Machine hours cannot be negative."),
});
export const serviceUpdateSchema = serviceCreateSchema.partial();
export const serviceQuerySchema = listQuerySchema;

/* Orders */
export const orderCreateSchema = z.object({
  serviceId: id,
  week: z.coerce
    .number()
    .int("Week must be a whole number.")
    .min(1, "Week must be between 1 and 48.")
    .max(48, "Week must be between 1 and 48."),
  units: z.coerce
    .number()
    .int("Units must be a whole number.")
    .positive("Units must be greater than zero."),
});
export const orderUpdateSchema = orderCreateSchema.partial();
export const orderQuerySchema = listQuerySchema.extend({
  serviceId: z.string().optional(),
});

/* Payments */
export const paymentCreateSchema = z.object({
  orderId: id,
  method: z.enum(PAYMENT_METHODS, { message: "Choose Cash, GCash or Maya." }),
});
export const paymentUpdateSchema = z.object({
  orderId: z.string().min(1).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
});
export const paymentQuerySchema = listQuerySchema.extend({
  method: z.enum(PAYMENT_METHODS).optional(),
});

/* Machine usage */
export const machineUsageCreateSchema = z
  .object({
    day: z.coerce
      .number()
      .int("Day must be a whole number.")
      .min(1, "Day must be between 1 and 60.")
      .max(60, "Day must be between 1 and 60."),
    hoursAvailable: z.coerce
      .number()
      .min(0, "Available hours cannot be negative.")
      .max(24, "Available hours cannot exceed 24.")
      .default(13),
    hoursUsed: z.coerce
      .number()
      .min(0, "Used hours cannot be negative.")
      .max(24, "Used hours cannot exceed 24."),
  })
  .refine((value) => value.hoursUsed <= value.hoursAvailable, {
    path: ["hoursUsed"],
    message: "Used hours cannot exceed available hours.",
  });
export const machineUsageUpdateSchema = z.object({
  day: z.coerce.number().int().min(1).max(60).optional(),
  hoursAvailable: z.coerce.number().min(0).max(24).optional(),
  hoursUsed: z.coerce.number().min(0).max(24).optional(),
});
export const machineUsageQuerySchema = listQuerySchema;

/* Marketing */
export const marketingCreateSchema = z.object({
  channel: z.enum(CAMPAIGN_CHANNELS, { message: "Choose a valid campaign channel." }),
  cost: z.coerce.number().min(0, "Cost cannot be negative."),
  leads: z.coerce
    .number()
    .int("Leads must be a whole number.")
    .min(0, "Leads cannot be negative."),
});
export const marketingUpdateSchema = marketingCreateSchema.partial();
export const marketingQuerySchema = listQuerySchema.extend({
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
});
