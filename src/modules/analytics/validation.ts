import { z } from "zod";

export const forecastModelSchema = z.enum([
  "moving_average",
  "exp_smoothing",
  "linear",
]);

/** What a forecast covers: a calendar month, one week, or the next 15 days. */
export const forecastHorizonSchema = z.enum(["month", "week", "days15"]);

const windowSchema = z.coerce
  .number()
  .int("The moving-average window must be a whole number.")
  .min(2, "Use at least 2 periods in the window.")
  .max(6, "Use at most 6 periods in the window.")
  .default(3);

const alphaSchema = z.coerce
  .number()
  .min(0.1, "Alpha must be at least 0.1.")
  .max(0.9, "Alpha must be at most 0.9.")
  .default(0.3);

const hoursSchema = z.coerce
  .number()
  .int("Machine hours must be a whole number.")
  .min(200, "Choose at least 200 machine hours.")
  .max(600, "Choose at most 600 machine hours.")
  .default(400);

/** GET /analytics/descriptive */
export const descriptiveQuerySchema = z.object({
  granularity: z.enum(["month", "week"]).default("month"),
});

/** GET /analytics/forecast */
export const forecastQuerySchema = z.object({
  model: forecastModelSchema.default("linear"),
  window: windowSchema,
  alpha: alphaSchema,
  horizon: forecastHorizonSchema.default("month"),
});

/** POST /analytics/optimize-plan */
export const optimizePlanSchema = z.object({
  hoursAvailable: hoursSchema,
  model: forecastModelSchema.default("linear"),
  window: windowSchema,
  alpha: alphaSchema,
});

export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
export type OptimizePlanInput = z.infer<typeof optimizePlanSchema>;
export type DescriptiveQuery = z.infer<typeof descriptiveQuerySchema>;
