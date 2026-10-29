import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

declare global {
  namespace Express {
    interface Request {
      valid: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

/**
 * Validates and replaces request inputs with parsed values. Express 5 exposes
 * `req.query` as a getter, so parsed query/params are attached to `req.valid`
 * for controllers to consume.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.valid = {};
    if (schemas.params) {
      req.valid.params = schemas.params.parse(req.params);
    }
    if (schemas.query) {
      req.valid.query = schemas.query.parse(req.query);
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
      req.valid.body = req.body;
    }
    next();
  };
}
