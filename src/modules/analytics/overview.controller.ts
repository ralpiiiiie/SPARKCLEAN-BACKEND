import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  descriptiveQuerySchema,
  optimizeSchema,
  performanceQuerySchema,
} from "./overview.validation.js";
import type { forecastQuerySchema } from "./forecastRuns.validation.js";
import * as service from "./overview.service.js";
import { previewForecast } from "./forecastRuns.service.js";

export async function descriptive(req: Request, res: Response): Promise<void> {
  res.json(
    await service.descriptive(req.valid.query as z.infer<typeof descriptiveQuerySchema>),
  );
}

export async function predictive(req: Request, res: Response): Promise<void> {
  const { branchId } = req.valid.query as { branchId?: string };
  res.json(await service.predictive(branchId));
}

export async function forecast(req: Request, res: Response): Promise<void> {
  res.json(await previewForecast(req.valid.query as z.infer<typeof forecastQuerySchema>));
}

export async function dailyForecast(req: Request, res: Response): Promise<void> {
  const { days } = req.valid.query as { days: number };
  res.json(await service.dailyForecast(days));
}

export async function performance(req: Request, res: Response): Promise<void> {
  res.json(
    await service.performanceImprovement(
      req.valid.query as z.infer<typeof performanceQuerySchema>,
    ),
  );
}

export async function optimize(req: Request, res: Response): Promise<void> {
  res.json(await service.optimize(req.valid.body as z.infer<typeof optimizeSchema>));
}
