import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool } from "../client.js";
import { env } from "../../config/env.js";
import {
  adminUsers,
  appSettings,
  customers,
  machineUsageLog,
  marketingCampaigns,
  orders,
  payments,
  services,
} from "../schema/index.js";
import { dataset } from "./dataset.js";

const BUSINESS_TABLES = [
  "payments",
  "orders",
  "machine_usage_log",
  "marketing_campaigns",
  "customers",
  "services",
  "app_settings",
];

function databaseHost(): string {
  try {
    return new URL(env.DATABASE_URL.replace(/^postgres(ql)?:\/\//, "http://")).hostname;
  } catch {
    return "unknown host";
  }
}

/**
 * Rebuilds the deterministic dataset. Existing admin accounts are preserved so
 * re-running the seed never locks an operator out.
 */
export async function runSeed(): Promise<void> {
  if (env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "Seed aborted: ALLOW_SEED=true is required when NODE_ENV=production.",
    );
  }

  console.log(`Seeding Spark Clean dataset at ${databaseHost()} (host only)…`);

  await db.execute(
    sql.raw(`TRUNCATE TABLE ${BUSINESS_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`),
  );

  await db.insert(services).values(
    dataset.services.map((service) => ({
      id: service.id,
      name: service.name,
      unitLabel: service.unitLabel,
      price: String(service.price),
      cost: String(service.cost),
      machineHoursPerUnit: String(service.machineHoursPerUnit),
    })),
  );

  await db.insert(customers).values(
    dataset.customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      barangay: customer.barangay,
      type: customer.type as (typeof customers.$inferInsert)["type"],
    })),
  );

  await db.insert(orders).values(dataset.orders);
  await db.insert(payments).values(
    dataset.payments.map((payment) => ({
      ...payment,
      amount: String(payment.amount),
      method: payment.method as (typeof payments.$inferInsert)["method"],
    })),
  );
  await db.insert(machineUsageLog).values(
    dataset.machineUsage.map((row) => ({
      ...row,
      hoursAvailable: String(row.hoursAvailable),
      hoursUsed: String(row.hoursUsed),
    })),
  );
  await db.insert(marketingCampaigns).values(
    dataset.marketingCampaigns.map((campaign) => ({
      ...campaign,
      cost: String(campaign.cost),
      channel: campaign.channel as (typeof marketingCampaigns.$inferInsert)["channel"],
    })),
  );

  await db.insert(appSettings).values({
    currency: "₱",
    machineHoursDefault: 400,
    datasetLabel: dataset.meta.label,
  });

  // ── Accounts: create-only, never overwrite an existing administrator ──
  const adminEmail = (process.env.ADMIN_SEED_EMAIL ?? "admin@sparkclean.com").toLowerCase();
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "SparkClean2024!";
  const [existingAdmin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(sql`lower(${adminUsers.email}) = ${adminEmail}`)
    .limit(1);

  if (!existingAdmin) {
    await db.insert(adminUsers).values({
      username: "Main Admin",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "admin",
    });
    console.log(`Main Admin created: ${adminEmail}`);
  } else {
    console.log(`Main Admin preserved (not overwritten): ${adminEmail}`);
  }

  const counts = await pool.query<{ table: string; count: number }>(
    `
      SELECT 'services' AS table, count(*)::int AS count FROM services
      UNION ALL SELECT 'customers', count(*)::int FROM customers
      UNION ALL SELECT 'orders', count(*)::int FROM orders
      UNION ALL SELECT 'payments', count(*)::int FROM payments
      UNION ALL SELECT 'machine_usage_log', count(*)::int FROM machine_usage_log
      UNION ALL SELECT 'marketing_campaigns', count(*)::int FROM marketing_campaigns
      ORDER BY 1
    `,
  );

  console.log("Seed complete. Row counts:");
  for (const row of counts.rows) {
    console.log(`  ${row.table.padEnd(22)} ${row.count}`);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runSeed()
    .catch((error) => {
      console.error("Seed failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
