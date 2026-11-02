import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { adminUsers, branches } from "../db/schema/index.js";

export type AuthRole = "admin" | "analyst" | "manager";

/** Shape attached to every authenticated request. */
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: AuthRole;
  roleLevel: number;
  /** Trusted branch assignment loaded from the database, never from the client. */
  branchId: string | null;
  branchName: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  id?: number;
  tv?: number;
}

export function roleLevelOf(role: AuthRole): number {
  if (role === "admin") return 3;
  if (role === "manager") return 2;
  return 1;
}

/**
 * Verify a Bearer JWT, then re-load the account from the database so role,
 * branch assignment and token revocation are always server-authoritative.
 * A token only proves identity; it never carries permissions on its own.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    return;
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as TokenPayload;
  } catch {
    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "The provided token is invalid or expired." },
    });
    return;
  }

  if (!payload?.id) {
    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "The provided token is invalid or expired." },
    });
    return;
  }

  try {
    const [row] = await db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        email: adminUsers.email,
        role: adminUsers.role,
        branchId: adminUsers.branchId,
        branchName: branches.name,
        tokenVersion: adminUsers.tokenVersion,
      })
      .from(adminUsers)
      .leftJoin(branches, eq(adminUsers.branchId, branches.id))
      .where(eq(adminUsers.id, payload.id))
      .limit(1);

    if (!row) {
      res.status(401).json({
        error: { code: "ACCOUNT_NOT_FOUND", message: "This account no longer exists." },
      });
      return;
    }

    if ((payload.tv ?? 0) !== row.tokenVersion) {
      res.status(401).json({
        error: {
          code: "TOKEN_REVOKED",
          message: "Your session has ended. Please sign in again.",
        },
      });
      return;
    }

    if (row.role === "manager" && !row.branchId) {
      res.status(403).json({
        error: {
          code: "BRANCH_NOT_ASSIGNED",
          message: "This branch manager account has no branch assignment. Contact an administrator.",
        },
      });
      return;
    }

    req.user = {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      roleLevel: roleLevelOf(row.role),
      branchId: row.branchId ?? null,
      branchName: row.branchName ?? null,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/** Role guard usable after requireAuth. */
export function requireRole(...roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." },
      });
      return;
    }
    next();
  };
}
