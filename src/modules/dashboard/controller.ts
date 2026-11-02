import type { Request, Response } from "express";
import type { z } from "zod";
import type { dashboardQuerySchema } from "./validation.js";
import { resolveBranchScope } from "../../middleware/branchScope.js";
import * as service from "./service.js";

export async function summary(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof dashboardQuerySchema>;
  // `resolveBranchScope` throws 403 if a manager asks for another branch and
  // otherwise pins the scope to their own assignment.
  const branchScope = resolveBranchScope(req, query.branchId);
  res.json(await service.dashboardSummary(query, branchScope));
}
