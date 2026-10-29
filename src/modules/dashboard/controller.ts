import type { Request, Response } from "express";
import type { z } from "zod";
import type { dashboardQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function summary(req: Request, res: Response): Promise<void> {
  res.json(await service.dashboardSummary(req.valid.query as z.infer<typeof dashboardQuerySchema>));
}
