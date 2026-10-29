CREATE TYPE "public"."baseline_method" AS ENUM('proportional', 'smoothing');--> statement-breakpoint
CREATE TYPE "public"."campaign_channel" AS ENUM('Facebook', 'TikTok', 'Flyers', 'Referral', 'Radio', 'Promo Code');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('Individual', 'Condo', 'Dormitory', 'Hotel', 'Restaurant', 'Clinic');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('Completed', 'In Transit', 'Delayed');--> statement-breakpoint
CREATE TYPE "public"."forecast_model" AS ENUM('linear', 'quadratic', 'cubic', 'exponential', 'smoothing', 'auto');--> statement-breakpoint
CREATE TYPE "public"."forecast_status" AS ENUM('Draft', 'Approved', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."loyalty_tier" AS ENUM('Bronze', 'Silver', 'Gold', 'Platinum');--> statement-breakpoint
CREATE TYPE "public"."note_page" AS ENUM('descriptive', 'predictive', 'prescriptive', 'summary');--> statement-breakpoint
CREATE TYPE "public"."note_tag" AS ENUM('Insight', 'Warning', 'Action', 'Question');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('Received', 'Washing', 'Ready', 'Delivered', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('Cash', 'GCash', 'Maya', 'Card');--> statement-breakpoint
CREATE TYPE "public"."procedure_status" AS ENUM('Not started', 'In progress', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."recommendation_priority" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."recommendation_stage" AS ENUM('Descriptive', 'Predictive', 'Prescriptive');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('Open', 'In progress', 'Done');--> statement-breakpoint
CREATE TYPE "public"."scenario_demand_source" AS ENUM('forecast', 'manual');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('Draft', 'Solved', 'Approved', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('Planned', 'Dispatched', 'Delivered', 'Cancelled');--> statement-breakpoint
CREATE TABLE "analyst_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"page" "note_page" NOT NULL,
	"branch_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tag" "note_tag" DEFAULT 'Insight' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"author" text DEFAULT 'Admin User' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"rush_cost_per_load" numeric(12, 2) DEFAULT '150' NOT NULL,
	"storage_cost_per_load" numeric(12, 2) DEFAULT '75' NOT NULL,
	"currency" text DEFAULT '₱' NOT NULL,
	"units" text DEFAULT 'loads' NOT NULL,
	"validation_months" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_procedure_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"month_no" integer NOT NULL,
	"period_label" text NOT NULL,
	"status" "procedure_status" DEFAULT 'Not started' NOT NULL,
	"owner" text DEFAULT 'Admin User' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_procedure_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"step_no" integer NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" "recommendation_priority" NOT NULL,
	"related_step" "recommendation_stage" NOT NULL,
	"owner" text DEFAULT 'Admin User' NOT NULL,
	"due_date" date,
	"status" "recommendation_status" DEFAULT 'Open' NOT NULL,
	"estimated_savings" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_monthly_demand" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"month_no" integer NOT NULL,
	"loads" integer NOT NULL,
	"month_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"manager" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "cost_assumptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rush_cost_per_load" numeric(12, 2) NOT NULL,
	"storage_cost_per_load" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"address" text NOT NULL,
	"branch_id" text NOT NULL,
	"type" "customer_type" NOT NULL,
	"join_date" date NOT NULL,
	"loyalty_tier" "loyalty_tier" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"plant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"cost_per_load" numeric(12, 2) NOT NULL,
	"distance_km" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"forecast_run_id" integer NOT NULL,
	"month_no" integer NOT NULL,
	"forecast_loads" numeric(12, 2) NOT NULL,
	"lower" numeric(12, 2) NOT NULL,
	"upper" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"branch_id" text NOT NULL,
	"model" "forecast_model" DEFAULT 'auto' NOT NULL,
	"horizon" integer DEFAULT 3 NOT NULL,
	"training_end" date NOT NULL,
	"validation_months" integer DEFAULT 3 NOT NULL,
	"r2" numeric(8, 4) DEFAULT '0' NOT NULL,
	"mad" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "forecast_status" DEFAULT 'Draft' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"branch_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"budget" numeric(12, 2) NOT NULL,
	"new_customers" integer NOT NULL,
	"revenue_generated" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"chosen_model" "forecast_model" NOT NULL,
	"reason" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_overrides_branch_id_unique" UNIQUE("branch_id")
);
--> statement-breakpoint
CREATE TABLE "optimization_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fuel_cost_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"demand_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"capacity_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"demand_source" "scenario_demand_source" DEFAULT 'forecast' NOT NULL,
	"status" "scenario_status" DEFAULT 'Draft' NOT NULL,
	"baseline_method" "baseline_method" DEFAULT 'proportional' NOT NULL,
	"total_cost" numeric(14, 2),
	"baseline_cost" numeric(14, 2),
	"savings_amount" numeric(14, 2),
	"savings_pct" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"service_id" text NOT NULL,
	"kg" integer NOT NULL,
	"loads" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"status" "order_status" NOT NULL,
	"order_date" date NOT NULL,
	"is_pickup" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"plant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"date" date NOT NULL,
	"loads" integer NOT NULL,
	"cost" numeric(12, 2) NOT NULL,
	"status" "delivery_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"monthly_capacity" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plants_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"page" text NOT NULL,
	"filters_json" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_branch_demand" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"branch_id" text NOT NULL,
	"demand" numeric(12, 2) NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_cost_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"plant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"cost_per_load" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_plant_supply" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"plant_id" text NOT NULL,
	"supply" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_per_kg" numeric(12, 2) NOT NULL,
	"turnaround_hours" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shipping_schedule_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"plant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"loads" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"status" "schedule_status" DEFAULT 'Planned' NOT NULL,
	"is_manual_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyst_notes" ADD CONSTRAINT "analyst_notes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_procedure_steps" ADD CONSTRAINT "ba_procedure_steps_run_id_ba_procedure_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ba_procedure_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_monthly_demand" ADD CONSTRAINT "branch_monthly_demand_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_costs" ADD CONSTRAINT "delivery_costs_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_costs" ADD CONSTRAINT "delivery_costs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_results" ADD CONSTRAINT "forecast_results_forecast_run_id_forecast_runs_id_fk" FOREIGN KEY ("forecast_run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_runs" ADD CONSTRAINT "forecast_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_overrides" ADD CONSTRAINT "model_overrides_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_deliveries" ADD CONSTRAINT "plant_deliveries_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_deliveries" ADD CONSTRAINT "plant_deliveries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_branch_demand" ADD CONSTRAINT "scenario_branch_demand_scenario_id_optimization_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."optimization_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_branch_demand" ADD CONSTRAINT "scenario_branch_demand_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_cost_matrix" ADD CONSTRAINT "scenario_cost_matrix_scenario_id_optimization_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."optimization_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_cost_matrix" ADD CONSTRAINT "scenario_cost_matrix_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_cost_matrix" ADD CONSTRAINT "scenario_cost_matrix_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_plant_supply" ADD CONSTRAINT "scenario_plant_supply_scenario_id_optimization_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."optimization_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_plant_supply" ADD CONSTRAINT "scenario_plant_supply_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_schedule_items" ADD CONSTRAINT "shipping_schedule_items_scenario_id_optimization_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."optimization_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_schedule_items" ADD CONSTRAINT "shipping_schedule_items_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_schedule_items" ADD CONSTRAINT "shipping_schedule_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyst_notes_page_idx" ON "analyst_notes" USING btree ("page");--> statement-breakpoint
CREATE UNIQUE INDEX "ba_procedure_steps_run_step_uq" ON "ba_procedure_steps" USING btree ("run_id","step_no");--> statement-breakpoint
CREATE INDEX "ba_procedure_steps_run_idx" ON "ba_procedure_steps" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_monthly_demand_branch_month_uq" ON "branch_monthly_demand" USING btree ("branch_id","month_no");--> statement-breakpoint
CREATE INDEX "branch_monthly_demand_branch_idx" ON "branch_monthly_demand" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "customers_branch_idx" ON "customers" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_costs_plant_branch_uq" ON "delivery_costs" USING btree ("plant_id","branch_id");--> statement-breakpoint
CREATE INDEX "delivery_costs_branch_idx" ON "delivery_costs" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "forecast_results_run_idx" ON "forecast_results" USING btree ("forecast_run_id");--> statement-breakpoint
CREATE INDEX "forecast_runs_branch_idx" ON "forecast_runs" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_branch_idx" ON "marketing_campaigns" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "model_overrides_branch_idx" ON "model_overrides" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_order_date_idx" ON "orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "orders_branch_idx" ON "orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_service_idx" ON "orders" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "plant_deliveries_branch_idx" ON "plant_deliveries" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "plant_deliveries_date_idx" ON "plant_deliveries" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_branch_demand_uq" ON "scenario_branch_demand" USING btree ("scenario_id","branch_id");--> statement-breakpoint
CREATE INDEX "scenario_branch_demand_scenario_idx" ON "scenario_branch_demand" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_cost_matrix_uq" ON "scenario_cost_matrix" USING btree ("scenario_id","plant_id","branch_id");--> statement-breakpoint
CREATE INDEX "scenario_cost_matrix_scenario_idx" ON "scenario_cost_matrix" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_plant_supply_uq" ON "scenario_plant_supply" USING btree ("scenario_id","plant_id");--> statement-breakpoint
CREATE INDEX "scenario_plant_supply_scenario_idx" ON "scenario_plant_supply" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "shipping_schedule_scenario_idx" ON "shipping_schedule_items" USING btree ("scenario_id");