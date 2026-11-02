import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const customerTypeEnum = pgEnum("customer_type", [
  "Individual",
  "Condo",
  "Dormitory",
  "Hotel",
  "Restaurant",
  "Clinic",
]);
export const loyaltyTierEnum = pgEnum("loyalty_tier", [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "Cash",
  "GCash",
  "Maya",
  "Card",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "Received",
  "Washing",
  "Ready",
  "Delivered",
  "Cancelled",
]);
export const campaignChannelEnum = pgEnum("campaign_channel", [
  "Facebook",
  "TikTok",
  "Flyers",
  "Referral",
  "Radio",
  "Promo Code",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "Completed",
  "In Transit",
  "Delayed",
]);

/* ── Core reference data ── */

export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  city: text("city").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  manager: text("manager").notNull(),
  ...timestamps,
});

export const plants = pgTable("plants", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  city: text("city").notNull(),
  monthlyCapacity: integer("monthly_capacity").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  ...timestamps,
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  pricePerKg: numeric("price_per_kg", { precision: 12, scale: 2 }).notNull(),
  turnaroundHours: integer("turnaround_hours").notNull(),
  ...timestamps,
});

export const deliveryCosts = pgTable(
  "delivery_costs",
  {
    id: serial("id").primaryKey(),
    plantId: text("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "restrict" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    costPerLoad: numeric("cost_per_load", { precision: 12, scale: 2 }).notNull(),
    distanceKm: integer("distance_km").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("delivery_costs_plant_branch_uq").on(t.plantId, t.branchId),
    index("delivery_costs_branch_idx").on(t.branchId),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    address: text("address").notNull(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    type: customerTypeEnum("type").notNull(),
    joinDate: date("join_date").notNull(),
    loyaltyTier: loyaltyTierEnum("loyalty_tier").notNull(),
    ...timestamps,
  },
  (t) => [index("customers_branch_idx").on(t.branchId)],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    kg: integer("kg").notNull(),
    loads: integer("loads").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    status: orderStatusEnum("status").notNull(),
    orderDate: date("order_date").notNull(),
    isPickup: boolean("is_pickup").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("orders_order_date_idx").on(t.orderDate),
    index("orders_branch_idx").on(t.branchId),
    index("orders_status_idx").on(t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_service_idx").on(t.serviceId),
  ],
);

export const branchMonthlyDemand = pgTable(
  "branch_monthly_demand",
  {
    id: serial("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    monthNo: integer("month_no").notNull(),
    loads: integer("loads").notNull(),
    monthLabel: text("month_label").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("branch_monthly_demand_branch_month_uq").on(t.branchId, t.monthNo),
    index("branch_monthly_demand_branch_idx").on(t.branchId),
  ],
);

export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    channel: campaignChannelEnum("channel").notNull(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    budget: numeric("budget", { precision: 12, scale: 2 }).notNull(),
    newCustomers: integer("new_customers").notNull(),
    revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [index("marketing_campaigns_branch_idx").on(t.branchId)],
);

export const plantDeliveries = pgTable(
  "plant_deliveries",
  {
    id: text("id").primaryKey(),
    plantId: text("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "restrict" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    loads: integer("loads").notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    status: deliveryStatusEnum("status").notNull(),
    ...timestamps,
  },
  (t) => [
    index("plant_deliveries_branch_idx").on(t.branchId),
    index("plant_deliveries_date_idx").on(t.date),
  ],
);

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  rushCostPerLoad: numeric("rush_cost_per_load", { precision: 12, scale: 2 })
    .notNull()
    .default("150"),
  storageCostPerLoad: numeric("storage_cost_per_load", { precision: 12, scale: 2 })
    .notNull()
    .default("75"),
  currency: text("currency").notNull().default("₱"),
  units: text("units").notNull().default("loads"),
  validationMonths: integer("validation_months").notNull().default(3),
  ...timestamps,
});

/* ── Analytics CRUD ── */

export const notePageEnum = pgEnum("note_page", [
  "descriptive",
  "predictive",
  "prescriptive",
  "summary",
]);
export const noteTagEnum = pgEnum("note_tag", ["Insight", "Warning", "Action", "Question"]);

export const analystNotes = pgTable(
  "analyst_notes",
  {
    id: serial("id").primaryKey(),
    page: notePageEnum("page").notNull(),
    branchId: text("branch_id").references(() => branches.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tag: noteTagEnum("tag").notNull().default("Insight"),
    pinned: boolean("pinned").notNull().default(false),
    author: text("author").notNull().default("Admin User"),
    ...timestamps,
  },
  (t) => [index("analyst_notes_page_idx").on(t.page)],
);

export const savedViews = pgTable("saved_views", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  page: text("page").notNull(),
  filtersJson: jsonb("filters_json").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

export const forecastModelEnum = pgEnum("forecast_model", [
  "linear",
  "quadratic",
  "cubic",
  "exponential",
  "smoothing",
  "auto",
]);
export const forecastStatusEnum = pgEnum("forecast_status", [
  "Draft",
  "Approved",
  "Archived",
]);

export const forecastRuns = pgTable(
  "forecast_runs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    model: forecastModelEnum("model").notNull().default("auto"),
    horizon: integer("horizon").notNull().default(3),
    trainingEnd: date("training_end").notNull(),
    validationMonths: integer("validation_months").notNull().default(3),
    r2: numeric("r2", { precision: 8, scale: 4 }).notNull().default("0"),
    mad: numeric("mad", { precision: 12, scale: 2 }).notNull().default("0"),
    status: forecastStatusEnum("status").notNull().default("Draft"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("forecast_runs_branch_idx").on(t.branchId)],
);

export const forecastResults = pgTable(
  "forecast_results",
  {
    id: serial("id").primaryKey(),
    forecastRunId: integer("forecast_run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    monthNo: integer("month_no").notNull(),
    forecastLoads: numeric("forecast_loads", { precision: 12, scale: 2 }).notNull(),
    lower: numeric("lower", { precision: 12, scale: 2 }).notNull(),
    upper: numeric("upper", { precision: 12, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [index("forecast_results_run_idx").on(t.forecastRunId)],
);

export const modelOverrides = pgTable(
  "model_overrides",
  {
    id: serial("id").primaryKey(),
    branchId: text("branch_id")
      .notNull()
      .unique()
      .references(() => branches.id, { onDelete: "cascade" }),
    chosenModel: forecastModelEnum("chosen_model").notNull(),
    reason: text("reason").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("model_overrides_branch_idx").on(t.branchId)],
);

export const costAssumptions = pgTable("cost_assumptions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  rushCostPerLoad: numeric("rush_cost_per_load", { precision: 12, scale: 2 }).notNull(),
  storageCostPerLoad: numeric("storage_cost_per_load", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  ...timestamps,
});

export const scenarioDemandSourceEnum = pgEnum("scenario_demand_source", [
  "forecast",
  "manual",
]);
export const scenarioStatusEnum = pgEnum("scenario_status", [
  "Draft",
  "Solved",
  "Approved",
  "Archived",
]);
export const baselineMethodEnum = pgEnum("baseline_method", ["proportional", "smoothing"]);

export const optimizationScenarios = pgTable("optimization_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  fuelCostPct: numeric("fuel_cost_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  demandPct: numeric("demand_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  capacityPct: numeric("capacity_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  demandSource: scenarioDemandSourceEnum("demand_source").notNull().default("forecast"),
  status: scenarioStatusEnum("status").notNull().default("Draft"),
  baselineMethod: baselineMethodEnum("baseline_method").notNull().default("proportional"),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }),
  baselineCost: numeric("baseline_cost", { precision: 14, scale: 2 }),
  savingsAmount: numeric("savings_amount", { precision: 14, scale: 2 }),
  savingsPct: numeric("savings_pct", { precision: 8, scale: 2 }),
  ...timestamps,
});

export const scenarioPlantSupply = pgTable(
  "scenario_plant_supply",
  {
    id: serial("id").primaryKey(),
    scenarioId: integer("scenario_id")
      .notNull()
      .references(() => optimizationScenarios.id, { onDelete: "cascade" }),
    plantId: text("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "restrict" }),
    supply: numeric("supply", { precision: 12, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("scenario_plant_supply_uq").on(t.scenarioId, t.plantId),
    index("scenario_plant_supply_scenario_idx").on(t.scenarioId),
  ],
);

export const scenarioBranchDemand = pgTable(
  "scenario_branch_demand",
  {
    id: serial("id").primaryKey(),
    scenarioId: integer("scenario_id")
      .notNull()
      .references(() => optimizationScenarios.id, { onDelete: "cascade" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    demand: numeric("demand", { precision: 12, scale: 2 }).notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("scenario_branch_demand_uq").on(t.scenarioId, t.branchId),
    index("scenario_branch_demand_scenario_idx").on(t.scenarioId),
  ],
);

export const scenarioCostMatrix = pgTable(
  "scenario_cost_matrix",
  {
    id: serial("id").primaryKey(),
    scenarioId: integer("scenario_id")
      .notNull()
      .references(() => optimizationScenarios.id, { onDelete: "cascade" }),
    plantId: text("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "restrict" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    costPerLoad: numeric("cost_per_load", { precision: 12, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("scenario_cost_matrix_uq").on(t.scenarioId, t.plantId, t.branchId),
    index("scenario_cost_matrix_scenario_idx").on(t.scenarioId),
  ],
);

export const scheduleStatusEnum = pgEnum("schedule_status", [
  "Planned",
  "Dispatched",
  "Delivered",
  "Cancelled",
]);

export const shippingScheduleItems = pgTable(
  "shipping_schedule_items",
  {
    id: serial("id").primaryKey(),
    scenarioId: integer("scenario_id")
      .notNull()
      .references(() => optimizationScenarios.id, { onDelete: "cascade" }),
    plantId: text("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "restrict" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    loads: numeric("loads", { precision: 12, scale: 2 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    totalCost: numeric("total_cost", { precision: 14, scale: 2 }).notNull(),
    status: scheduleStatusEnum("status").notNull().default("Planned"),
    isManualOverride: boolean("is_manual_override").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("shipping_schedule_scenario_idx").on(t.scenarioId)],
);

export const procedureStatusEnum = pgEnum("procedure_status", [
  "Not started",
  "In progress",
  "Completed",
]);

export const baProcedureRuns = pgTable("ba_procedure_runs", {
  id: serial("id").primaryKey(),
  monthNo: integer("month_no").notNull(),
  periodLabel: text("period_label").notNull(),
  status: procedureStatusEnum("status").notNull().default("Not started"),
  owner: text("owner").notNull().default("Admin User"),
  notes: text("notes"),
  ...timestamps,
});

export const baProcedureSteps = pgTable(
  "ba_procedure_steps",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => baProcedureRuns.id, { onDelete: "cascade" }),
    stepNo: integer("step_no").notNull(),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ba_procedure_steps_run_step_uq").on(t.runId, t.stepNo),
    index("ba_procedure_steps_run_idx").on(t.runId),
  ],
);

export const recommendationPriorityEnum = pgEnum("recommendation_priority", [
  "High",
  "Medium",
  "Low",
]);
export const recommendationStageEnum = pgEnum("recommendation_stage", [
  "Descriptive",
  "Predictive",
  "Prescriptive",
]);
export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "Open",
  "In progress",
  "Done",
]);

export const baRecommendations = pgTable("ba_recommendations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: recommendationPriorityEnum("priority").notNull(),
  relatedStep: recommendationStageEnum("related_step").notNull(),
  owner: text("owner").notNull().default("Admin User"),
  dueDate: date("due_date"),
  status: recommendationStatusEnum("status").notNull().default("Open"),
  estimatedSavings: numeric("estimated_savings", { precision: 14, scale: 2 }),
  ...timestamps,
});

export const baReports = pgTable("ba_reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  ...timestamps,
});

/* ── Relations ── */

export const adminRoleEnum = pgEnum("admin_role", ["admin", "analyst"]);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRoleEnum("role").notNull().default("analyst"),
  ...timestamps,
}, (t) => [index("admin_users_email_idx").on(t.email)]);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    ...timestamps,
  },
  (t) => [index("chat_conversations_admin_idx").on(t.adminId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    ...timestamps,
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId)],
);

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  conversations: many(chatConversations),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  admin: one(adminUsers, { fields: [chatConversations.adminId], references: [adminUsers.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const branchesRelations = relations(branches, ({ many }) => ({
  customers: many(customers),
  orders: many(orders),
  demand: many(branchMonthlyDemand),
  campaigns: many(marketingCampaigns),
  deliveries: many(plantDeliveries),
}));

export const plantsRelations = relations(plants, ({ many }) => ({
  deliveries: many(plantDeliveries),
  costs: many(deliveryCosts),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  branch: one(branches, { fields: [customers.branchId], references: [branches.id] }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
  service: one(services, { fields: [orders.serviceId], references: [services.id] }),
}));

export const forecastRunsRelations = relations(forecastRuns, ({ one, many }) => ({
  branch: one(branches, { fields: [forecastRuns.branchId], references: [branches.id] }),
  results: many(forecastResults),
}));

export const forecastResultsRelations = relations(forecastResults, ({ one }) => ({
  run: one(forecastRuns, {
    fields: [forecastResults.forecastRunId],
    references: [forecastRuns.id],
  }),
}));

export const scenariosRelations = relations(optimizationScenarios, ({ many }) => ({
  supply: many(scenarioPlantSupply),
  demand: many(scenarioBranchDemand),
  matrix: many(scenarioCostMatrix),
  schedule: many(shippingScheduleItems),
}));

export const procedureRunsRelations = relations(baProcedureRuns, ({ many }) => ({
  steps: many(baProcedureSteps),
}));
