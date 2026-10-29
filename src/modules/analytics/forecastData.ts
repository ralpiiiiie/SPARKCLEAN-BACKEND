import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branchMonthlyDemand, modelOverrides } from "../../db/schema/index.js";
import {
  runBranchForecast,
  type BranchForecast,
  type DemandPoint,
  type ForecastModelName,
} from "../../analytics/forecast.js";
import { ApiError } from "../../utils/errors.js";

export async function loadDemandHistory(branchId: string): Promise<DemandPoint[]> {
  return db
    .select({
      monthNo: branchMonthlyDemand.monthNo,
      loads: branchMonthlyDemand.loads,
      monthLabel: branchMonthlyDemand.monthLabel,
    })
    .from(branchMonthlyDemand)
    .where(eq(branchMonthlyDemand.branchId, branchId))
    .orderBy(asc(branchMonthlyDemand.monthNo));
}

export async function activeOverride(branchId: string) {
  const [row] = await db
    .select()
    .from(modelOverrides)
    .where(eq(modelOverrides.branchId, branchId));
  return row && row.active ? row : null;
}

export async function computeBranchForecast(options: {
  branchId: string;
  model?: ForecastModelName | "auto";
  horizon: number;
  validationMonths?: number;
}): Promise<BranchForecast> {
  const history = await loadDemandHistory(options.branchId);
  if (history.length < 6) {
    throw ApiError.badRequest(
      "At least 6 monthly demand records are required to fit a forecast",
      "INSUFFICIENT_HISTORY",
    );
  }
  const override = await activeOverride(options.branchId);
  const overrideModel =
    override && options.model && options.model !== "auto"
      ? undefined
      : override
        ? {
            model: override.chosenModel as ForecastModelName,
            reason: override.reason,
          }
        : undefined;

  try {
    return runBranchForecast({
      history,
      horizon: options.horizon,
      validationMonths: options.validationMonths,
      model: overrideModel ? overrideModel.model : options.model,
      override: overrideModel ?? null,
    });
  } catch (error) {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : "Forecast could not be computed",
      "FORECAST_FAILED",
    );
  }
}
