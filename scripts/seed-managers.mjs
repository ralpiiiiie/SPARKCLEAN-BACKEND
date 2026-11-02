/**
 * Creates the two demo branch-manager accounts (Mandaue BR002, Talisay BR004).
 *
 * Safety properties:
 * - Applies pending migrations, never drops or truncates business data.
 * - Only inserts/updates the two demo manager emails below; the existing Main
 *   Admin and every other account is left untouched.
 * - Passwords are bcrypt-hashed before they reach PostgreSQL. Plaintext is
 *   never stored, logged, or shipped to the frontend.
 * - Re-running is safe: existing demo accounts keep their password unless
 *   `--reset-passwords` is passed, which also bumps token_version so any old
 *   session is revoked.
 *
 * Usage (from backend/):
 *   node scripts/seed-managers.mjs
 *   node scripts/seed-managers.mjs --reset-passwords
 *
 * Optional overrides:
 *   MANDAUE_MANAGER_EMAIL / MANDAUE_MANAGER_PASSWORD
 *   TALISAY_MANAGER_EMAIL / TALISAY_MANAGER_PASSWORD
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
const resetPasswords = process.argv.includes("--reset-passwords");

if (!connectionString) {
  console.error("Missing DATABASE_URL_DIRECT (or DATABASE_URL). Aborting.");
  process.exit(1);
}

const MANAGERS = [
  {
    branchId: "BR002",
    username: "Mandaue Branch Manager",
    email: (process.env.MANDAUE_MANAGER_EMAIL || "mandaue.manager@sparkclean.com")
      .trim()
      .toLowerCase(),
    password: process.env.MANDAUE_MANAGER_PASSWORD || "MandaueDemo#2026",
  },
  {
    branchId: "BR004",
    username: "Talisay Branch Manager",
    email: (process.env.TALISAY_MANAGER_EMAIL || "talisay.manager@sparkclean.com")
      .trim()
      .toLowerCase(),
    password: process.env.TALISAY_MANAGER_PASSWORD || "TalisayDemo#2026",
  },
];

for (const manager of MANAGERS) {
  if (manager.password.length < 8) {
    console.error(`Password for ${manager.email} must be at least 8 characters. Aborting.`);
    process.exit(1);
  }
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

  for (const manager of MANAGERS) {
    const branch = await pool.query(
      "SELECT id, name, city FROM branches WHERE id = $1",
      [manager.branchId],
    );
    if (!branch.rowCount) {
      throw new Error(
        `Branch ${manager.branchId} was not found. Refusing to create an unassigned manager.`,
      );
    }
    const branchRow = branch.rows[0];

    const collision = await pool.query(
      "SELECT id, role, branch_id FROM admin_users WHERE email = $1",
      [manager.email],
    );

    if (!collision.rowCount) {
      const passwordHash = await bcrypt.hash(manager.password, 10);
      await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, role, branch_id, token_version)
         VALUES ($1, $2, $3, 'manager', $4, 0)`,
        [manager.username, manager.email, passwordHash, branchRow.id],
      );
      console.log(`Created manager ${manager.email} → ${branchRow.name} (${branchRow.id}).`);
      continue;
    }

    const existing = collision.rows[0];
    if (existing.role !== "manager") {
      throw new Error(
        `${manager.email} already belongs to a "${existing.role}" account. Refusing to overwrite it.`,
      );
    }

    if (resetPasswords) {
      const passwordHash = await bcrypt.hash(manager.password, 10);
      await pool.query(
        `UPDATE admin_users
            SET password_hash = $1,
                branch_id = $2,
                token_version = token_version + 1,
                updated_at = now()
          WHERE email = $3`,
        [passwordHash, branchRow.id, manager.email],
      );
      console.log(`Reset password for ${manager.email} and revoked existing sessions.`);
    } else if (existing.branch_id !== branchRow.id) {
      await pool.query(
        "UPDATE admin_users SET branch_id = $1, updated_at = now() WHERE email = $2",
        [branchRow.id, manager.email],
      );
      console.log(`Re-assigned ${manager.email} → ${branchRow.name} (${branchRow.id}); password unchanged.`);
    } else {
      console.log(`Manager already present and unchanged: ${manager.email}`);
    }
  }

  console.log("Manager seed complete.");
} catch (error) {
  console.error("Manager seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
