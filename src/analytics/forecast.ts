import { linearFit, polynomialRegression } from "./regression.js";

export type ForecastModelName =
  | "linear"
  | "quadratic"
  | "cubic"
  | "exponential"
  | "smoothing";

export interface DemandPoint {
  monthNo: number;
  loads: number;
  monthLabel: string;
}

export interface ModelFit {
  model: ForecastModelName;
  coefficients: number[];
  rSquared: number;
  mad: number;
  validationMad: number;
  predictions: number[];
}

export interface ForecastPoint {
  monthNo: number;
  forecastLoads: number;
  lower: number;
  upper: number;
}

export interface BranchForecast {
  model: ForecastModelName;
  autoModel: ForecastModelName;
  overridden: boolean;
  trainingEndMonthNo: number;
  r2: number;
  mad: number;
  models: ModelFit[];
  history: DemandPoint[];
  forecast: ForecastPoint[];
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

export function predictWithModel(
  model: ForecastModelName,
  coefficients: number[],
  x: number,
): number {
  if (model === "exponential") {
    return Math.exp(coefficients[0] + coefficients[1] * x);
  }
  return coefficients.reduce((sum, c, i) => sum + c * x ** i, 0);
}

function fitModel(model: ForecastModelName, x: number[], y: number[]): ModelFit {
  if (model === "exponential") {
    const safeY = y.map((v) => (v > 0 ? v : 0.001));
    const logY = safeY.map((v) => Math.log(v));
    const { slope, intercept } = linearFit(x, logY);
    const predictions = x.map((xi) => Math.exp(intercept + slope * xi));
    const residuals = y.map((yi, i) => yi - predictions[i]);
    const ssTotal = y.reduce((sum, yi) => sum + (yi - mean(y)) ** 2, 0);
    const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
    return {
      model,
      coefficients: [intercept, slope],
      rSquared: ssTotal ? Math.max(0, Math.min(1, 1 - ssRes / ssTotal)) : 1,
      mad: residuals.reduce((s, r) => s + Math.abs(r), 0) / y.length,
      validationMad: 0,
      predictions,
    };
  }

  if (model === "smoothing") {
    const predictions = y.map((_, i) =>
      i === 0 ? y[0] : mean(y.slice(Math.max(0, i - 3), i)),
    );
    const residuals = y.map((yi, i) => yi - predictions[i]);
    const ssTotal = y.reduce((sum, yi) => sum + (yi - mean(y)) ** 2, 0);
    const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
    return {
      model,
      coefficients: [],
      rSquared: ssTotal ? Math.max(0, Math.min(1, 1 - ssRes / ssTotal)) : 1,
      mad: residuals.reduce((s, r) => s + Math.abs(r), 0) / y.length,
      validationMad: 0,
      predictions,
    };
  }

  const degree = model === "linear" ? 1 : model === "quadratic" ? 2 : 3;
  const results = polynomialRegression(x, y, degree);
  return {
    model,
    coefficients: results.coefficients,
    rSquared: results.rSquared,
    mad: results.mad,
    validationMad: 0,
    predictions: results.predictions,
  };
}

function validationPredictions(
  model: ForecastModelName,
  coefficients: number[],
  trainY: number[],
  xValues: number[],
): number[] {
  if (model !== "smoothing") {
    return xValues.map((x) => predictWithModel(model, coefficients, x));
  }
  const history = [...trainY];
  return xValues.map(() => {
    const value = mean(history.slice(-3));
    history.push(value);
    return value;
  });
}

export function runBranchForecast(options: {
  history: DemandPoint[];
  validationMonths?: number;
  horizon: number;
  model?: ForecastModelName | "auto";
  override?: { model: ForecastModelName; reason?: string } | null;
}): BranchForecast {
  const history = [...options.history].sort((a, b) => a.monthNo - b.monthNo);
  if (history.length < 6) {
    throw new Error("At least 6 monthly demand records are required to fit a forecast");
  }

  const validationMonths = Math.min(
    options.validationMonths ?? 3,
    Math.max(1, history.length - 3),
  );
  const split = history.length - validationMonths;
  const training = history.slice(0, split);
  const holdout = history.slice(split);
  const trainX = training.map((p) => p.monthNo);
  const trainY = training.map((p) => p.loads);

  const candidateModels: ForecastModelName[] = [
    "linear",
    "quadratic",
    "cubic",
    "exponential",
    "smoothing",
  ];

  const models = candidateModels.map((model) => {
    const fit = fitModel(model, trainX, trainY);
    const predictions = validationPredictions(model, fit.coefficients, trainY, holdout.map((p) => p.monthNo));
    const validationMad =
      predictions.reduce((sum, value, i) => sum + Math.abs(holdout[i].loads - value), 0) /
      predictions.length;
    return { ...fit, validationMad };
  });

  const autoModel = models.reduce(
    (best, current) =>
      current.validationMad < best.validationMad ||
      (Math.abs(current.validationMad - best.validationMad) < 0.01 && current.model === "linear")
        ? current
        : best,
    models[0],
  ).model;

  const requested = options.model && options.model !== "auto" ? options.model : autoModel;
  const chosen = models.find((m) => m.model === requested) ?? models[0];
  const predictionModel = chosen.model;

  const fullX = history.map((p) => p.monthNo);
  const fullY = history.map((p) => p.loads);
  const fullFit = fitModel(predictionModel, fullX, fullY);
  const lastMonthNo = history[history.length - 1].monthNo;
  const band = 1.96 * chosen.validationMad;

  const values: number[] = [];
  if (predictionModel === "smoothing") {
    const buffer = [...fullY];
    for (let i = 0; i < options.horizon; i += 1) {
      const value = Math.max(0, mean(buffer.slice(-3)));
      buffer.push(value);
      values.push(value);
    }
  } else {
    for (let i = 0; i < options.horizon; i += 1) {
      const x = lastMonthNo + i + 1;
      values.push(Math.max(0, predictWithModel(predictionModel, fullFit.coefficients, x)));
    }
  }

  const forecast: ForecastPoint[] = values.map((value, i) => ({
    monthNo: lastMonthNo + i + 1,
    forecastLoads: Math.round(value),
    lower: Math.max(0, Math.round(value - band)),
    upper: Math.round(value + band),
  }));

  return {
    model: predictionModel,
    autoModel,
    overridden:
      Boolean(options.override) ||
      (options.model !== undefined &&
        options.model !== "auto" &&
        options.model !== autoModel),
    trainingEndMonthNo: training[training.length - 1].monthNo,
    r2: fullFit.rSquared,
    mad: fullFit.mad,
    models,
    history,
    forecast,
  };
}

export interface BranchWorkloadForecast {
  branchId: string;
  branch: string;
  recentAvg: number;
  lastMonth: number;
  forecastLoads: number;
  changePct: number;
  direction: "up" | "down" | "flat";
}

export function forecastBranchWorkloads(
  demand: Array<{ branchId: string; branchName: string; monthNo: number; loads: number }>,
): BranchWorkloadForecast[] {
  const byBranch = new Map<string, { name: string; loads: number[] }>();
  for (const row of demand) {
    const entry = byBranch.get(row.branchId) ?? { name: row.branchName, loads: [] };
    entry.loads[row.monthNo - 1] = row.loads;
    byBranch.set(row.branchId, entry);
  }

  const out: BranchWorkloadForecast[] = [];
  for (const [branchId, entry] of byBranch) {
    const values = entry.loads.filter((v) => typeof v === "number");
    if (values.length < 4) continue;
    const window = values.slice(-6);
    const { slope, intercept } = linearFit(
      window.map((_, i) => i),
      window,
    );
    const lastMonth = window[window.length - 1];
    const projection = Math.max(0, Math.round(intercept + slope * window.length));
    const changePct = lastMonth ? ((projection - lastMonth) / lastMonth) * 100 : 0;
    out.push({
      branchId,
      branch: entry.name,
      recentAvg: Math.round(mean(window)),
      lastMonth,
      forecastLoads: projection,
      changePct,
      direction: changePct > 3 ? "up" : changePct < -3 ? "down" : "flat",
    });
  }
  return out.sort((a, b) => b.forecastLoads - a.forecastLoads);
}
