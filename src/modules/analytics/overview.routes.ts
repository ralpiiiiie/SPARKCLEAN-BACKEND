import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  descriptiveQuerySchema,
  optimizeSchema,
  performanceQuerySchema,
} from "./overview.validation.js";
import { forecastQuerySchema } from "./forecastRuns.validation.js";
import * as controller from "./overview.controller.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/descriptive",
  validate({ query: descriptiveQuerySchema }),
  controller.descriptive,
);
analyticsRouter.get(
  "/predictive",
  validate({ query: z.object({ branchId: z.string().optional() }) }),
  controller.predictive,
);
analyticsRouter.get("/forecast", validate({ query: forecastQuerySchema }), controller.forecast);
analyticsRouter.get(
  "/daily-forecast",
  validate({
    query: z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }),
  }),
  controller.dailyForecast,
);
analyticsRouter.get(
  "/performance-improvement",
  validate({ query: performanceQuerySchema }),
  controller.performance,
);
analyticsRouter.post("/optimize", validate({ body: optimizeSchema }), controller.optimize);
