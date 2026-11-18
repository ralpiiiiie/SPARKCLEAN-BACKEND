import { Router, type Request, type Response } from "express";
import type { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  descriptiveQuerySchema,
  forecastQuerySchema,
  optimizePlanSchema,
} from "./validation.js";
import * as service from "./service.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/descriptive",
  validate({ query: descriptiveQuerySchema }),
  async (req: Request, res: Response) => {
    const query = req.valid.query as z.infer<typeof descriptiveQuerySchema>;
    res.json(await service.descriptive(query));
  },
);

analyticsRouter.get(
  "/forecast",
  validate({ query: forecastQuerySchema }),
  async (req: Request, res: Response) => {
    const query = req.valid.query as z.infer<typeof forecastQuerySchema>;
    res.json(
      await service.forecast({
        model: query.model,
        window: query.window,
        alpha: query.alpha,
        horizon: query.horizon,
      }),
    );
  },
);

analyticsRouter.post(
  "/optimize-plan",
  validate({ body: optimizePlanSchema }),
  async (req: Request, res: Response) => {
    const body = req.valid.body as z.infer<typeof optimizePlanSchema>;
    res.json(
      await service.optimizePlan({
        hoursAvailable: body.hoursAvailable,
        params: { model: body.model, window: body.window, alpha: body.alpha },
      }),
    );
  },
);
