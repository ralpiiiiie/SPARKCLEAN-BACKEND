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
    columns: [col("id"), col("name"), col("barangay"), col("type")],
  },
  orders: {
    table: "orders",
    columns: [
      col("id"),
      col("service_id", "serviceId"),
      col("week"),
      col("month"),
      col("units"),
    ],
  },
  payments: {
    table: "payments",
    columns: [
      col("id"),
      col("order_id", "orderId"),
      col("amount"),
      col("method"),
      col("month"),
    ],
  },
  "machine-usage": {
    table: "machine_usage_log",
    columns: [
      col("id"),
      col("day"),
      col("hours_available", "hoursAvailable"),
      col("hours_used", "hoursUsed"),
    ],
  },
  marketing: {
    table: "marketing_campaigns",
    columns: [col("id"), col("channel"), col("cost"), col("leads")],
  },
  services: {
    table: "services",
    columns: [
      col("id"),
      col("name"),
      col("unit_label", "unitLabel"),
      col("price"),
      col("cost"),
      col("machine_hours_per_unit", "machineHoursPerUnit"),
    ],
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
