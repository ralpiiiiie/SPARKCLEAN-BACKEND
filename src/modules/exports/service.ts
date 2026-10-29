import { pool } from "../../db/client.js";
import { ApiError } from "../../utils/errors.js";

interface ExportSpec {
  table: string;
  columns: Array<{ key: string; column: string }>;
}

const col = (name: string, key = name) => ({ key, column: name });

const EXPORTS: Record<string, ExportSpec> = {
  customers: {
    table: "customers",
    columns: [
      col("id"),
      col("name"),
      col("phone"),
      col("email"),
      col("address"),
      col("branch_id", "branchId"),
      col("type"),
      col("join_date", "joinDate"),
      col("loyalty_tier", "loyaltyTier"),
    ],
  },
  orders: {
    table: "orders",
    columns: [
      col("id"),
      col("customer_id", "customerId"),
      col("branch_id", "branchId"),
      col("service_id", "serviceId"),
      col("kg"),
      col("loads"),
      col("amount"),
      col("payment_method", "paymentMethod"),
      col("status"),
      col("order_date", "orderDate"),
      col("is_pickup", "isPickup"),
    ],
  },
  demand: {
    table: "branch_monthly_demand",
    columns: [
      col("id"),
      col("branch_id", "branchId"),
      col("month_no", "monthNo"),
      col("loads"),
      col("month_label", "monthLabel"),
    ],
  },
  campaigns: {
    table: "marketing_campaigns",
    columns: [
      col("id"),
      col("name"),
      col("channel"),
      col("branch_id", "branchId"),
      col("start_date", "startDate"),
      col("end_date", "endDate"),
      col("budget"),
      col("new_customers", "newCustomers"),
      col("revenue_generated", "revenueGenerated"),
    ],
  },
  deliveries: {
    table: "plant_deliveries",
    columns: [
      col("id"),
      col("plant_id", "plantId"),
      col("branch_id", "branchId"),
      col("date"),
      col("loads"),
      col("cost"),
      col("status"),
    ],
  },
  branches: {
    table: "branches",
    columns: [
      col("id"),
      col("name"),
      col("city"),
      col("lat"),
      col("lng"),
      col("manager"),
    ],
  },
  plants: {
    table: "plants",
    columns: [
      col("id"),
      col("name"),
      col("city"),
      col("monthly_capacity", "monthlyCapacity"),
      col("lat"),
      col("lng"),
    ],
  },
  services: {
    table: "services",
    columns: [
      col("id"),
      col("name"),
      col("description"),
      col("price_per_kg", "pricePerKg"),
      col("turnaround_hours", "turnaroundHours"),
    ],
  },
  "delivery-costs": {
    table: "delivery_costs",
    columns: [
      col("id"),
      col("plant_id", "plantId"),
      col("branch_id", "branchId"),
      col("cost_per_load", "costPerLoad"),
      col("distance_km", "distanceKm"),
    ],
  },
  "forecast-runs": {
    table: "forecast_runs",
    columns: [
      col("id"),
      col("name"),
      col("branch_id", "branchId"),
      col("model"),
      col("horizon"),
      col("training_end", "trainingEnd"),
      col("validation_months", "validationMonths"),
      col("r2"),
      col("mad"),
      col("status"),
      col("notes"),
    ],
  },
  scenarios: {
    table: "optimization_scenarios",
    columns: [
      col("id"),
      col("name"),
      col("status"),
      col("demand_source", "demandSource"),
      col("baseline_method", "baselineMethod"),
      col("total_cost", "totalCost"),
      col("baseline_cost", "baselineCost"),
      col("savings_amount", "savingsAmount"),
      col("savings_pct", "savingsPct"),
    ],
  },
  recommendations: {
    table: "ba_recommendations",
    columns: [
      col("id"),
      col("title"),
      col("priority"),
      col("related_step", "relatedStep"),
      col("owner"),
      col("due_date", "dueDate"),
      col("status"),
      col("estimated_savings", "estimatedSavings"),
    ],
  },
  reports: {
    table: "ba_reports",
    columns: [col("id"), col("title"), col("created_at", "createdAt")],
  },
};

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function exportCsv(entity: string): Promise<{ filename: string; csv: string }> {
  const spec = EXPORTS[entity];
  if (!spec) throw ApiError.notFound(`Unknown export entity: ${entity}`);

  const select = spec.columns
    .map((column) => `"${column.column}" AS "${column.key}"`)
    .join(", ");
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${select} FROM "${spec.table}" ORDER BY 1`,
  );

  const header = spec.columns.map((column) => column.key).join(",");
  const lines = result.rows.map((row) =>
    spec.columns.map((column) => escapeCell(row[column.key])).join(","),
  );
  return {
    filename: `sparkclean-${entity}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: [header, ...lines].join("\r\n"),
  };
}
