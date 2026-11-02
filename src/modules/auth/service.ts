import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { adminUsers } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import type { AuthUser } from "../../middleware/auth.js";

const JWT_EXPIRES = "8h";

/** Verify credentials and return a signed JWT + user profile. */
export async function login(email: string, password: string) {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error("Invalid email or password."), { code: "INVALID_CREDENTIALS", status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw Object.assign(new Error("Invalid email or password."), { code: "INVALID_CREDENTIALS", status: 401 });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role, roleLevel: user.role === "admin" ? 2 : 1 },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );

  return {
    token,
    expiresIn: JWT_EXPIRES,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      roleLevel: user.role === "admin" ? 2 : 1,
    },
  };
}

/** Return the public profile for an authenticated user id. */
export async function getMe(id: number) {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    roleLevel: user.role === "admin" ? 2 : 1,
  };
}

/** Create a new admin/analyst account. Requires the caller to be an admin. */
export async function createUser(input: { username: string; email: string; password: string; role: "admin" | "analyst" }) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const [created] = await db
    .insert(adminUsers)
    .values({
      username: input.username,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
    })
    .returning();
  return {
    id: created.id,
    username: created.username,
    email: created.email,
    role: created.role,
    roleLevel: created.role === "admin" ? 2 : 1,
  };
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
    .from(adminUsers);
  return rows.map((r) => ({ ...r, roleLevel: r.role === "admin" ? 2 : 1 }));
}