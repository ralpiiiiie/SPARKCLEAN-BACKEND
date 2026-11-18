import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { asc, eq, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { adminUsers } from "../../db/schema/index.js";
import { roleLevelOf, type AuthRole } from "../../middleware/auth.js";

const JWT_EXPIRES = "8h";

interface AccountRow {
  id: number;
  username: string;
  email: string;
  role: AuthRole;
  tokenVersion: number;
}

function profileOf(row: AccountRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    roleLevel: roleLevelOf(row.role),
  };
}

const accountSelection = {
  id: adminUsers.id,
  username: adminUsers.username,
  email: adminUsers.email,
  role: adminUsers.role,
  tokenVersion: adminUsers.tokenVersion,
} as const;

async function findAccountById(id: number): Promise<AccountRow | null> {
  const [row] = await db
    .select(accountSelection)
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);
  return row ?? null;
}

function signToken(row: AccountRow): string {
  return jwt.sign({ id: row.id, tv: row.tokenVersion }, env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}

/** Verify credentials and return a signed JWT + trusted user profile. */
export async function login(email: string, password: string) {
  const [user] = await db
    .select({
      ...accountSelection,
      passwordHash: adminUsers.passwordHash,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error("Invalid email or password."), {
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw Object.assign(new Error("Invalid email or password."), {
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  }

  return {
    token: signToken(user),
    expiresIn: JWT_EXPIRES,
    user: profileOf(user),
  };
}

/** Return the public profile for an authenticated user id. */
export async function getMe(id: number) {
  const row = await findAccountById(id);
  return row ? profileOf(row) : null;
}

/**
 * Revoke every outstanding token for this account. `requireAuth` compares the
 * JWT's token version with the database, so the token is unusable immediately.
 */
export async function logout(id: number): Promise<void> {
  await db
    .update(adminUsers)
    .set({ tokenVersion: sql`${adminUsers.tokenVersion} + 1`, updatedAt: new Date() })
    .where(eq(adminUsers.id, id));
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  role: AuthRole;
}

/** Create a new account. Requires the caller to be an admin. */
export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const [created] = await db
    .insert(adminUsers)
    .values({
      username: input.username,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
    })
    .returning({ id: adminUsers.id });

  return getMe(created.id);
}

/** List all users (admin only). */
export async function listUsers() {
  const rows = await db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      email: adminUsers.email,
      role: adminUsers.role,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.id));
  return rows.map((row) => ({ ...row, roleLevel: roleLevelOf(row.role) }));
}
