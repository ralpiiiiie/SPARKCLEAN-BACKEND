import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors.js";

/**
 * Branch isolation helpers.
 *
 * The branch a manager may see is always taken from `req.user.branchId`, which
 * `requireAuth` loads from the database on every request. Query strings, body
 * fields and headers supplied by the client can never widen that scope.
 */

export function isBranchManager(req: Request): boolean {
  return req.user?.role === "manager";
}

/** The manager's branch, or null for global administrators/analysts. */
export function managerBranchId(req: Request): string | null {
  return req.user?.role === "manager" ? (req.user.branchId ?? null) : null;
}

/**
 * Resolve the effective branch filter for a request.
 * - Managers: their own branch. Asking for another branch is a hard 403.
 * - Admin/analyst: the requested branch, or all branches when omitted.
 */
export function resolveBranchScope(req: Request, requested?: string | null): string | null {
  if (req.user?.role !== "manager") return requested ?? null;

  const own = req.user.branchId;
  if (!own) {
    throw new ApiError(
      403,
      "BRANCH_NOT_ASSIGNED",
      "This branch manager account has no branch assignment.",
    );
  }
  if (requested && requested !== own) {
    throw new ApiError(
      403,
      "BRANCH_FORBIDDEN",
      "You can only access records belonging to your assigned branch.",
    );
  }
  return own;
}

/**
 * For record-by-id endpoints: a manager may only read a record whose branch
 * matches their assignment. Respond 404 so the existence of other branches'
 * records is not disclosed.
 */
export function assertRecordBranch(req: Request, recordBranchId: string | null | undefined): void {
  if (req.user?.role !== "manager") return;
  if (!recordBranchId || recordBranchId !== req.user.branchId) {
    throw new ApiError(404, "NOT_FOUND", "Record not found.");
  }
}

interface AccessRule {
  methods: string[];
  pattern: RegExp;
}

/**
 * Default-deny allow-list for branch-manager accounts.
 *
 * The dashboards only need read access to their own dashboard, orders,
 * customers, branch and services — plus their private AI assistant. Every
 * other route (analytics, exports, settings, business administration, plants,
 * campaigns, deliveries) stays admin/analyst-only.
 */
const MANAGER_RULES: AccessRule[] = [
  { methods: ["GET"], pattern: /^\/dashboard\/summary\/?$/ },
  { methods: ["GET"], pattern: /^\/orders(?:\/[\w-]+)?\/?$/ },
  { methods: ["GET"], pattern: /^\/customers(?:\/[\w-]+)?\/?$/ },
  { methods: ["GET"], pattern: /^\/branches(?:\/[\w-]+)?\/?$/ },
  { methods: ["GET"], pattern: /^\/services(?:\/[\w-]+)?\/?$/ },
  { methods: ["GET"], pattern: /^\/auth\/me\/?$/ },
  { methods: ["POST"], pattern: /^\/auth\/logout\/?$/ },
  { methods: ["POST"], pattern: /^\/ai\/chat\/?$/ },
  { methods: ["GET", "DELETE"], pattern: /^\/ai\/conversations(?:\/\d+)?\/?$/ },
];

export function managerAccessGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "manager") {
    next();
    return;
  }

  const path = req.originalUrl.split("?")[0].replace(/^\/api\/v1(?=\/|$)/, "") || "/";
  const allowed = MANAGER_RULES.some(
    (rule) => rule.methods.includes(req.method) && rule.pattern.test(path),
  );

  if (!allowed) {
    res.status(403).json({
      error: {
        code: "BRANCH_SCOPE_FORBIDDEN",
        message:
          "Branch manager accounts can only access their own branch dashboard, branch records and private assistant.",
      },
    });
    return;
  }
  next();
}
