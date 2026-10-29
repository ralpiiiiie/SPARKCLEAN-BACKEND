import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors.js";

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
}

/** Drizzle wraps driver errors, so walk the cause chain to find the PG code. */
function findPgError(error: unknown): PgLikeError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "object" && current !== null) {
      const candidate = current as Record<string, unknown>;
      if (typeof candidate.code === "string") {
        return {
          code: candidate.code,
          constraint:
            typeof candidate.constraint === "string" ? candidate.constraint : undefined,
          detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
        };
      }
    }
    current =
      typeof current === "object" && current !== null
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return null;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.flatten(),
      },
    });
    return;
  }

  const pg = findPgError(err);
  if (pg && pg.code) {
    if (pg.code === "23503") {
      res.status(409).json({
        error: {
          code: "FK_CONSTRAINT",
          message:
            "This record is still referenced by other records or references a missing record.",
          details: pg.detail ?? pg.constraint,
        },
      });
      return;
    }
    if (pg.code === "23505") {
      res.status(409).json({
        error: {
          code: "UNIQUE_VIOLATION",
          message: "A record with the same unique values already exists.",
          details: pg.detail ?? pg.constraint,
        },
      });
      return;
    }
    if (pg.code === "23514") {
      res.status(400).json({
        error: {
          code: "CHECK_VIOLATION",
          message: "The submitted values violate a database constraint.",
          details: pg.detail,
        },
      });
      return;
    }
  }

  console.error("Unhandled error", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
  });
}
