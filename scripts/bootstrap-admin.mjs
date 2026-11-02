/**
 * One-time production bootstrap for the AI assistant.
 *
 * - Applies any pending Drizzle migrations (creates admin_users,
 *   chat_conversations, chat_messages on databases seeded before the
 *   assistant was added).
 * - Creates the admin account if it is missing, or resets its password if it
 *   already exists.
 *
 * It never truncates or deletes business data. Run it from backend/ with:
 *
 *   DATABASE_URL_DIRECT="postgres://…direct…" \
 *   ADMIN_SEED_EMAIL="admin@sparkclean.com" \
 *   ADMIN_SEED_PASSWORD="a-strong-password" \
 *   node scripts/bootstrap-admin.mjs
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
const email = (process.env.ADMIN_SEED_EMAIL || "admin@sparkclean.com").trim().toLowerCase();
const password = process.env.ADMIN_SEED_PASSWORD;

if (!connectionString) {
  console.error("Missing DATABASE_URL_DIRECT (or DATABASE_URL). Aborting.");
  process.exit(1);
}
if (!password || password.length < 6) {
  console.error("Set ADMIN_SEED_PASSWORD to at least 6 characters. Aborting.");
  process.exit(1);
}

const ssl = /sslmode=(require|verify-ca|verify-full)/.test(connectionString)
  ? { rejectUnauthorized: false }
  : undefined;

const pool = new pg.Pool({ connectionString, max: 1, ssl });

try {
  console.log("Applying pending migrations…");
  await migrate(drizzle(pool), {
    migrationsFolder: path.resolve(__dirname, "../src/db/migrations"),
  });
  console.log("Migrations applied.");

  const existing = await pool.query("SELECT id FROM admin_users WHERE email = $1", [email]);
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing.rowCount) {
    await pool.query(
      "UPDATE admin_users SET password_hash = $1, role = 'admin', updated_at = now() WHERE email = $2",
      [passwordHash, email],
    );
    console.log(`Existing admin updated (password reset): ${email}`);
  } else {
    await pool.query(
      `INSERT INTO admin_users (username, email, password_hash, role)
       VALUES ('Admin User', $1, $2, 'admin')`,
      [email, passwordHash],
    );
    console.log(`Admin created: ${email}`);
  }

  console.log("Bootstrap complete. You can sign in to the AI assistant now.");
} catch (error) {
  console.error("Bootstrap failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
