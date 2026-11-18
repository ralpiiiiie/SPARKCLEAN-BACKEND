import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";
import { env } from "../config/env.js";
import { runSeed } from "./seed/index.js";

/**
 * Safe destructive reset for a disposable database (local Docker or Neon
 * branch). Drops the public schema — removing every legacy table, enum and
 * migration record — then rebuilds the schema and reseeds the new dataset.
 *
 * Production requires an explicit ALLOW_SEED=true. Only the database host is
 * ever printed, never the password.
 */
function databaseHost(): string {
  try {
    return new URL(env.DATABASE_URL.replace(/^postgres(ql)?:\/\//, "http://")).hostname;
  } catch {
    return "unknown host";
  }
}

async function reset(): Promise<void> {
  if (env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "db:reset aborted: ALLOW_SEED=true is required when NODE_ENV=production.",
    );
  }

  console.log(`Resetting database at ${databaseHost()} (host only)…`);

  const db = drizzle(pool);

  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  console.log("Dropped legacy schema and recreated public.");

  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
  await migrate(db, { migrationsFolder });
  console.log("Applied fresh migrations.");

  await runSeed();
  console.log("Reset complete.");
}

reset()
  .catch((error) => {
    console.error("Reset failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
