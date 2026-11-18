CREATE TYPE "public"."admin_role" AS ENUM('admin', 'analyst', 'manager');--> statement-breakpoint
CREATE TYPE "public"."campaign_channel" AS ENUM('Facebook', 'Flyers', 'Referral', 'Tarpaulin', 'Promo');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('Student', 'Household', 'Boarding house', 'Business');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('Cash', 'GCash', 'Maya');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'analyst' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username"),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" text DEFAULT '₱' NOT NULL,
	"machine_hours_default" integer DEFAULT 400 NOT NULL,
	"dataset_label" text DEFAULT 'Deterministic Spark Clean dataset' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"barangay" text NOT NULL,
	"type" "customer_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"day" integer NOT NULL,
	"hours_available" numeric(6, 2) DEFAULT '13' NOT NULL,
	"hours_used" numeric(6, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_usage_day_check" CHECK ("machine_usage_log"."day" between 1 and 60),
	CONSTRAINT "machine_usage_hours_check" CHECK ("machine_usage_log"."hours_used" >= 0 and "machine_usage_log"."hours_used" <= "machine_usage_log"."hours_available")
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"cost" numeric(12, 2) NOT NULL,
	"leads" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_cost_check" CHECK ("marketing_campaigns"."cost" >= 0),
	CONSTRAINT "marketing_leads_check" CHECK ("marketing_campaigns"."leads" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"week" integer NOT NULL,
	"month" text NOT NULL,
	"units" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_week_check" CHECK ("orders"."week" between 1 and 48),
	CONSTRAINT "orders_units_check" CHECK ("orders"."units" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit_label" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"cost" numeric(12, 2) NOT NULL,
	"machine_hours_per_unit" numeric(8, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name"),
	CONSTRAINT "services_price_check" CHECK ("services"."price" >= 0),
	CONSTRAINT "services_cost_check" CHECK ("services"."cost" >= 0),
	CONSTRAINT "services_hours_check" CHECK ("services"."machine_hours_per_unit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_users_email_idx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_barangay_idx" ON "customers" USING btree ("barangay");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_usage_day_uq" ON "machine_usage_log" USING btree ("day");--> statement-breakpoint
CREATE INDEX "marketing_channel_idx" ON "marketing_campaigns" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "orders_service_idx" ON "orders" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "orders_week_idx" ON "orders" USING btree ("week");--> statement-breakpoint
CREATE INDEX "orders_month_idx" ON "orders" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_uq" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_month_idx" ON "payments" USING btree ("month");