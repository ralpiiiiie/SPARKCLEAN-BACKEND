/**
 * Forecast model unit tests.
 *
 * Tiny known series pin the three models to hand-checkable numbers, the seeded
 * dataset is used to print the Part C verification table, and the greedy
 * optimiser is checked against the profit-per-machine-hour ranking.
 *
 * Run: npm test   (tsx --test tests/*.test.ts)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAYS15_SCALE,
  backtestMad,
  bestFitModel,
  buildForecastPayload,
  compareModels,
  fittedValues,
  linearFit,
  nextValue,
  smoothingLevels,
  wholeForecast,
} from "../src/analytics/forecast.js";
import { dataset } from "../src/db/seed/dataset.js";

const MONTHS = dataset.meta.period.months;
const NEXT_MONTH = dataset.meta.nextMonth;

function monthlyOf(serviceId: string): number[] {
  const totals = new Array(12).fill(0) as number[];
  for (const order of dataset.orders) {
    if (order.serviceId !== serviceId) continue;
    totals[Math.floor((order.week - 1) / 4)] += order.units;
  }
  return totals;
}

function weeklyOf(serviceId: string): number[] {
  const totals = new Array(48).fill(0) as number[];
  for (const order of dataset.orders) {
    if (order.serviceId !== serviceId) continue;
    totals[order.week - 1] += order.units;
  }
  return totals;
}

const LINEAR = { model: "linear", window: 3, alpha: 0.3 } as const;
const MOVING = { model: "moving_average", window: 3, alpha: 0.3 } as const;
const SMOOTHING = { model: "exp_smoothing", window: 3, alpha: 0.5 } as const;

test("moving average forecasts the mean of the window", () => {
  const window3 = { model: "moving_average", window: 3, alpha: 0.3 } as const;
  assert.equal(nextValue([10, 20, 30], window3), 20);
  assert.equal(wholeForecast([10, 20, 30], window3), 20);
  // A month only has a fitted value once k previous months exist.
  assert.deepEqual(fittedValues([10, 20, 30, 40], window3), [null, null, null, 20]);
  assert.equal(wholeForecast([10, 20, 30, 40], window3), 30);
});

test("exponential smoothing levels and forecast", () => {
  const values = [10, 20, 30];
  assert.deepEqual(smoothingLevels(values, 0.5), [10, 15, 22.5]);
  assert.equal(nextValue(values, SMOOTHING), 22.5);
  assert.equal(wholeForecast(values, SMOOTHING), 23);
  // Fitted value for month t is the previous level.
  assert.deepEqual(fittedValues(values, SMOOTHING), [null, 10, 15]);
});

test("linear trend fits slope 1 and forecasts the next month", () => {
  const values = [1, 2, 3];
  const fit = linearFit(values);
  assert.equal(fit.slope, 1);
  assert.equal(fit.intercept, 1);
  assert.equal(fit.r2, 1);
  assert.equal(nextValue(values, LINEAR), 4);
  assert.equal(wholeForecast(values, LINEAR), 4);
});

test("moving average and smoothing lag behind a rising series", () => {
  const rising = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210];
  const linear = wholeForecast(rising, LINEAR);
  const moving = wholeForecast(rising, { ...MOVING, window: 3 });
  const smoothing = wholeForecast(rising, { ...SMOOTHING, alpha: 0.3 });
  assert.ok(moving < linear, "moving average must sit below the trend line");
  assert.ok(smoothing < linear, "smoothing must sit below the trend line");
  assert.ok(
    backtestMad(rising, LINEAR) < backtestMad(rising, { ...MOVING, window: 3 }),
    "a clean trend should score the lowest MAD for the linear model",
  );
});

test("forecast payload reports all three models and one best fit", () => {
  const series = dataset.services.map((service) => ({
    id: service.id,
    name: service.name,
    unitLabel: service.unitLabel,
    points: monthlyOf(service.id),
  }));
  const payload = buildForecastPayload(series, MONTHS, NEXT_MONTH, LINEAR);

  assert.equal(payload.horizon, "month");
  assert.equal(payload.services.length, 4);
  assert.equal(payload.modelComparison.length, 3);
  assert.equal(
    payload.bestFit,
    bestFitModel(compareModels(series, LINEAR)),
  );
  for (const service of payload.services) {
    assert.equal(service.points.length, 12);
    assert.equal(service.fitted.length, 12);
    assert.equal(service.band.length, 13);
    assert.ok(service.forecast >= 0);
    assert.ok(Number.isInteger(service.forecast));
  }
});

test("the weekly horizon forecasts the week after the record", () => {
  const weekly = dataset.services.map((service) => ({
    id: service.id,
    name: service.name,
    unitLabel: service.unitLabel,
    points: weeklyOf(service.id),
  }));
  const labels = Array.from({ length: 48 }, (_, index) => `W${index + 1}`);
  const monthly = buildForecastPayload(
    weekly.map((service, index) => ({ ...service, points: monthlyOf(dataset.services[index].id) })),
    MONTHS,
    NEXT_MONTH,
    LINEAR,
  );
  const payload = buildForecastPayload(weekly, labels, "W49", LINEAR, {
    horizon: "week",
    monthForecasts: Object.fromEntries(
      monthly.services.map((service) => [service.id, service.forecast]),
    ),
  });

  assert.equal(payload.backtestFrom, 25);
  payload.services.forEach((service, index) => {
    assert.equal(service.points.length, 48);
    assert.ok(service.forecast < service.monthForecast, `${service.name}: week below month`);
    assert.equal(service.monthForecast, monthly.services[index].forecast);
  });
});

test("the 15-day horizon is the weekly series times 15/7", () => {
  const labels = Array.from({ length: 48 }, (_, index) => `W${index + 1}`);
  const week = dataset.services.map((service) => ({
    id: service.id,
    name: service.name,
    unitLabel: service.unitLabel,
    points: weeklyOf(service.id),
  }));
  const days15 = week.map((service) => ({
    ...service,
    points: service.points.map((units) => units * DAYS15_SCALE),
  }));
  const weekPayload = buildForecastPayload(week, labels, "W49", LINEAR, { horizon: "week" });
  const payload = buildForecastPayload(days15, labels, "15 days", LINEAR, { horizon: "days15" });

  payload.services.forEach((service, index) => {
    assert.ok(
      Math.abs(service.forecast - weekPayload.services[index].forecast * DAYS15_SCALE) <= 1,
      `${service.name}: 15-day forecast`,
    );
    assert.ok(Math.abs(service.mad - weekPayload.services[index].mad * DAYS15_SCALE) <= 0.02);
  });
});

test("optimiser ranks by profit per machine hour and never exceeds the forecast", () => {
  // Mirrors the server greedy rule on the seeded economics.
  const economics = dataset.services.map((service) => ({
    id: service.id,
    profitPerUnit: service.price - service.cost,
    hoursPerUnit: service.machineHoursPerUnit,
    profitPerHour: (service.price - service.cost) / service.machineHoursPerUnit,
  }));
  const ranked = [...economics].sort((a, b) => b.profitPerHour - a.profitPerHour);
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["SV01", "SV02", "SV03", "SV04"],
  );

  const forecasts = new Map(
    dataset.services.map((service) => [service.id, wholeForecast(monthlyOf(service.id), LINEAR)]),
  );
  let hoursLeft = 400;
  let profit = 0;
  for (const row of ranked) {
    const cap = forecasts.get(row.id) ?? 0;
    const units = Math.min(cap, Math.floor(hoursLeft / row.hoursPerUnit));
    hoursLeft = Math.round((hoursLeft - units * row.hoursPerUnit) * 100) / 100;
    profit += units * row.profitPerUnit;
  }
  assert.ok(profit > 0);
  assert.ok(hoursLeft >= 0 && hoursLeft < 1, "the greedy plan should nearly fill 400 hours");
});

// ── Part C verification table ───────────────────────────────────────────────
const series = dataset.services.map((service) => ({
  id: service.id,
  name: service.name,
  unitLabel: service.unitLabel,
  points: monthlyOf(service.id),
}));
const weekLabels = Array.from({ length: 48 }, (_, index) => `W${index + 1}`);
const weekSeries = dataset.services.map((service) => ({
  id: service.id,
  name: service.name,
  unitLabel: service.unitLabel,
  points: weeklyOf(service.id),
}));
const days15Series = weekSeries.map((service) => ({
  ...service,
  points: service.points.map((units) => units * DAYS15_SCALE),
}));

const params = { model: "linear", window: 3, alpha: 0.3 } as const;
const comparison = compareModels(series, params);
const monthPayload = buildForecastPayload(series, MONTHS, NEXT_MONTH, params);
const weekPayload = buildForecastPayload(weekSeries, weekLabels, "W49", params, {
  horizon: "week",
});
const daysPayload = buildForecastPayload(days15Series, weekLabels, "15 days", params, {
  horizon: "days15",
});

const rows: string[][] = [
  ["service", "model", "month-13 forecast", "MAD", "next week", "next 15 days"],
];
for (let index = 0; index < series.length; index += 1) {
  for (const model of ["linear", "moving_average", "exp_smoothing"] as const) {
    const payload = buildForecastPayload([series[index]], MONTHS, NEXT_MONTH, { ...params, model });
    const result = payload.services[0];
    rows.push([
      series[index].name,
      model,
      String(result.forecast),
      result.mad.toFixed(2),
      model === params.model ? String(weekPayload.services[index].forecast) : "",
      model === params.model ? String(daysPayload.services[index].forecast) : "",
    ]);
  }
}
const width = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
console.log(
  "\nPart C verification — forecast and backtest MAD per model (week / 15-day columns are the linear fit)",
);
for (const line of rows) {
  console.log("  " + line.map((cell, column) => cell.padEnd(width[column])).join("  ").trimEnd());
}
console.log(
  "\n  Best fit (lowest total MAD):",
  comparison.reduce((best, row) => (row.totalMad < best.totalMad ? row : best)).model,
  JSON.stringify(comparison),
);
