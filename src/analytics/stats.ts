export interface DescriptiveStats {
  mean: number;
  median: number;
  mode?: number;
  stdDev: number;
  stdError: number;
  variance: number;
  kurtosis: number;
  skewness: number;
  min: number;
  max: number;
  range: number;
  sum: number;
  count: number;
}

export function computeDescriptiveStats(data: number[]): DescriptiveStats {
  if (data.length === 0) {
    throw new Error("Data array cannot be empty");
  }

  const sorted = [...data].sort((a, b) => a - b);
  const n = data.length;
  const mean = data.reduce((sum, x) => sum + x, 0) / n;
  const median =
    n % 2 === 0
      ? (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2
      : sorted[Math.floor(n / 2)];

  const variance = data.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const stdError = stdDev / Math.sqrt(n);

  const frequencies = new Map<number, number>();
  for (const value of data) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const modeEntry = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0];

  const min = Math.min(...data);
  const max = Math.max(...data);

  const skewness =
    stdDev === 0
      ? 0
      : data.reduce((sum, x) => sum + ((x - mean) / stdDev) ** 3, 0) / n;
  const kurtosis =
    stdDev === 0
      ? 0
      : data.reduce((sum, x) => sum + ((x - mean) / stdDev) ** 4, 0) / n - 3;

  return {
    mean,
    median,
    mode: modeEntry ? modeEntry[0] : undefined,
    stdDev,
    stdError,
    variance,
    kurtosis,
    skewness,
    min,
    max,
    range: max - min,
    sum: data.reduce((sum, x) => sum + x, 0),
    count: n,
  };
}

export function computeCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    throw new Error("Arrays must have same length and be non-empty");
  }
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  return numerator / Math.sqrt(denomX * denomY);
}

export interface HistogramBin {
  label: string;
  start: number;
  end: number;
  count: number;
}

/** Equal-width histogram bins using the square-root rule for bin count. */
export function buildHistogram(values: number[], bins?: number): HistogramBin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const count = Math.max(1, bins ?? Math.ceil(Math.sqrt(values.length)));
  const width = (max - min) / count || 1;
  const out: HistogramBin[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = min + i * width;
    const end = i === count - 1 ? max : start + width;
    out.push({
      start: Math.round(start),
      end: Math.round(end),
      label: `${Math.round(start).toLocaleString()}–${Math.round(end).toLocaleString()}`,
      count: 0,
    });
  }
  for (const value of values) {
    const idx = Math.min(count - 1, Math.floor((value - min) / width));
    out[idx].count += 1;
  }
  return out;
}
