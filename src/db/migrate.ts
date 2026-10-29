import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "../config/env.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const connectionString = env.DATABASE_URL_DIRECT || env.DATABASE_URL;
  console.log("Running migrations against target DB...");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });

  const db = drizzle(pool);

  try {
    const migrationsFolder = path.resolve(__dirname, "../../src/db/migrations");
    await migrate(db, { migrationsFolder });
    console.log("Migrations completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
