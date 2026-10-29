export type RegressionModel = "linear" | "quadratic" | "cubic";

export interface RegressionResults {
  modelType: RegressionModel;
  coefficients: number[];
  rSquared: number;
  fStatistic: number;
  pValue: number;
  mad: number;
  predictions: number[];
  residuals: number[];
}

function solveNormalEquations(X: number[][], y: number[]): number[] {
  const n = y.length;
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => Array<number>(p).fill(0));
  const Xty: number[] = Array<number>(p).fill(0);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < p; j += 1) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k += 1) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }

  const augmented = XtX.map((row, i) => [...row, Xty[i]]);
  for (let i = 0; i < p; i += 1) {
    let maxRow = i;
    for (let k = i + 1; k < p; k += 1) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) maxRow = k;
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    for (let k = i + 1; k < p; k += 1) {
      const factor = augmented[k][i] / (augmented[i][i] || 1);
      for (let j = i; j <= p; j += 1) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  const coefficients = Array<number>(p).fill(0);
  for (let i = p - 1; i >= 0; i -= 1) {
    let sum = augmented[i][p];
    for (let j = i + 1; j < p; j += 1) {
      sum -= augmented[i][j] * coefficients[j];
    }
    coefficients[i] = sum / (augmented[i][i] || 1);
  }
  return coefficients;
}

export function polynomialRegression(
  x: number[],
  y: number[],
  degree: 1 | 2 | 3,
): RegressionResults {
  if (x.length !== y.length || x.length === 0) {
    throw new Error("Arrays must have same length and be non-empty");
  }
  const n = x.length;
  const X: number[][] = x.map((xi) =>
    Array.from({ length: degree + 1 }, (_, i) => xi ** i),
  );
  const coefficients = solveNormalEquations(X, y);
  const predictions = x.map((xi) =>
    coefficients.reduce((sum, c, i) => sum + c * xi ** i, 0),
  );
  const residuals = y.map((yi, i) => yi - predictions[i]);
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const ssTotal = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0);
  const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
  const rSquared = ssTotal === 0 ? 1 : 1 - ssRes / ssTotal;
  const p = degree + 1;
  const ssReg = ssTotal - ssRes;
  const fStatistic = ssRes === 0 ? 0 : ssReg / (p - 1) / (ssRes / Math.max(1, n - p));
  const pValue = Number.isFinite(fStatistic) ? Math.min(1, Math.exp(-fStatistic * 0.5)) : 1;
  const mad = residuals.reduce((sum, r) => sum + Math.abs(r), 0) / n;

  return {
    modelType: degree === 1 ? "linear" : degree === 2 ? "quadratic" : "cubic",
    coefficients,
    rSquared: Math.max(0, Math.min(1, rSquared)),
    fStatistic: Number.isFinite(fStatistic) ? fStatistic : 0,
    pValue,
    mad,
    predictions,
    residuals,
  };
}

export function predict(coefficients: number[], x: number): number {
  return coefficients.reduce((sum, c, i) => sum + c * x ** i, 0);
}

/** Linear least squares used by the exponential (log-linear) model. */
export function linearFit(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) ** 2;
  }
  const slope = denominator ? numerator / denominator : 0;
  return { slope, intercept: meanY - slope * meanX };
}
