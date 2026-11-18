import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ── Enumerations ── */

export const customerTypeEnum = pgEnum("customer_type", [
  "Student",
  "Household",
  "Boarding house",
  "Business",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["Cash", "GCash", "Maya"]);

export const campaignChannelEnum = pgEnum("campaign_channel", [
  "Facebook",
  "Flyers",
  "Referral",
  "Tarpaulin",
  "Promo",
]);

export const adminRoleEnum = pgEnum("admin_role", ["admin", "analyst", "manager"]);

/* ── Core business tables ── */

/**
 * The four Spark Clean services. Price and cost are stored per unit of the
 * service's own unit label (kg, item, piece, load).
 */
export const services = pgTable(
  "services",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    unitLabel: text("unit_label").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    machineHoursPerUnit: numeric("machine_hours_per_unit", {
      precision: 8,
      scale: 4,
    }).notNull(),
    ...timestamps,
  },
  (t) => [
    check("services_price_check", sql`${t.price} >= 0`),
    check("services_cost_check", sql`${t.cost} >= 0`),
    check("services_hours_check", sql`${t.machineHoursPerUnit} >= 0`),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    barangay: text("barangay").notNull(),
    type: customerTypeEnum("type").notNull(),
    ...timestamps,
  },
  (t) => [index("customers_barangay_idx").on(t.barangay), index("customers_name_idx").on(t.name)],
);

/** One row per service per week. `month` is derived from `week` by the API. */
export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    week: integer("week").notNull(),
    month: text("month").notNull(),
    units: integer("units").notNull(),
    ...timestamps,
  },
  (t) => [
    index("orders_service_idx").on(t.serviceId),
    index("orders_week_idx").on(t.week),
    index("orders_month_idx").on(t.month),
    check("orders_week_check", sql`${t.week} between 1 and 48`),
    check("orders_units_check", sql`${t.units} > 0`),
  ],
);

/** Exactly one payment per order. Amount is captured when the payment is made. */
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    month: text("month").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_order_uq").on(t.orderId),
    index("payments_month_idx").on(t.month),
    check("payments_amount_check", sql`${t.amount} >= 0`),
  ],
);

export const machineUsageLog = pgTable(
  "machine_usage_log",
  {
    id: text("id").primaryKey(),
    day: integer("day").notNull(),
    hoursAvailable: numeric("hours_available", { precision: 6, scale: 2 })
      .notNull()
      .default("13"),
    hoursUsed: numeric("hours_used", { precision: 6, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("machine_usage_day_uq").on(t.day),
    check("machine_usage_day_check", sql`${t.day} between 1 and 60`),
    check("machine_usage_hours_check", sql`${t.hoursUsed} >= 0 and ${t.hoursUsed} <= ${t.hoursAvailable}`),
  ],
);

export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: text("id").primaryKey(),
    channel: campaignChannelEnum("channel").notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    leads: integer("leads").notNull(),
    ...timestamps,
  },
  (t) => [
    index("marketing_channel_idx").on(t.channel),
    check("marketing_cost_check", sql`${t.cost} >= 0`),
    check("marketing_leads_check", sql`${t.leads} >= 0`),
  ],
);

/* ── Application settings + accounts ── */

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  currency: text("currency").notNull().default("₱"),
  machineHoursDefault: integer("machine_hours_default").notNull().default(400),
  datasetLabel: text("dataset_label")
    .notNull()
    .default("Deterministic Spark Clean dataset"),
  ...timestamps,
});

export const adminUsers = pgTable(
  "admin_users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: adminRoleEnum("role").notNull().default("analyst"),
    /** Incremented on logout so previously issued JWTs stop working immediately. */
    tokenVersion: integer("token_version").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("admin_users_email_idx").on(t.email)],
);

/* ── Relations ── */

export const servicesRelations = relations(services, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  service: one(services, { fields: [orders.serviceId], references: [services.id] }),
  payment: one(payments, { fields: [orders.id], references: [payments.orderId] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));
