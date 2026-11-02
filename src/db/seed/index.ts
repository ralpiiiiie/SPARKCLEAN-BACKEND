import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, pool } from "../client.js";
import { env } from "../../config/env.js";
import {
  adminUsers,
  analystNotes,
  appSettings,
  baProcedureRuns,
  baProcedureSteps,
  baRecommendations,
  baReports,
  branchMonthlyDemand,
  branches,
  chatConversations,
  chatMessages,
  costAssumptions,
  customers,
  deliveryCosts,
  forecastResults,
  forecastRuns,
  marketingCampaigns,
  modelOverrides,
  optimizationScenarios,
  orders,
  plantDeliveries,
  plants,
  savedViews,
  scenarioBranchDemand,
  scenarioCostMatrix,
  scenarioPlantSupply,
  services,
  shippingScheduleItems,
} from "../schema/index.js";
import { generateMockData } from "./data.js";
import { runBranchForecast } from "../../analytics/forecast.js";
import { buildScenarioPlan, latestDemandByBranch } from "../../analytics/scenario.js";
import { buildRecommendations } from "../../analytics/recommendations.js";

const TABLES = [
  "chat_messages",
  "chat_conversations",
  "admin_users",
  "ba_reports",
  "ba_recommendations",
  "ba_procedure_steps",
  "ba_procedure_runs",
  "shipping_schedule_items",
  "scenario_cost_matrix",
  "scenario_branch_demand",
  "scenario_plant_supply",
  "optimization_scenarios",
  "cost_assumptions",
  "model_overrides",
  "forecast_results",
  "forecast_runs",
  "saved_views",
  "analyst_notes",
  "app_settings",
  "plant_deliveries",
  "marketing_campaigns",
  "branch_monthly_demand",
  "orders",
  "customers",
  "delivery_costs",
  "services",
  "plants",
  "branches",
];

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    console.error("Seed script aborted: ALLOW_SEED=true is required in production (it TRUNCATEs all data).");
    process.exit(1);
  }

  const dbHost = new URL(env.DATABASE_URL.replace("postgres://", "http://")).hostname;
  console.log(`Seeding database at ${dbHost}...`);
  const data = generateMockData();

  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));

  // Default administrator for the AI assistant. Override with ADMIN_SEED_* env vars.
  const adminEmail = (process.env.ADMIN_SEED_EMAIL ?? "admin@sparkclean.com").toLowerCase();
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "SparkClean2024!";
  if (env.NODE_ENV === "production" && !process.env.ADMIN_SEED_PASSWORD) {
    console.warn(
      "WARNING: seeding the default demo password in production. Set ADMIN_SEED_PASSWORD (and change it after first login).",
    );
  }
  await db.insert(adminUsers).values({
    username: "Admin User",
    email: adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: "admin",
  });
  console.log(`Admin account ready: ${adminEmail}`);

  const branchId = new Map(data.branches.map((b) => [b.name, b.id]));
  const plantId = new Map(data.plants.map((p) => [p.name, p.id]));

  await db.insert(branches).values(data.branches);
  await db.insert(plants).values(data.plants);
  await db.insert(services).values(
    data.services.map((s) => ({
      ...s,
      pricePerKg: String(s.pricePerKg),
    })),
  );

  await db.insert(deliveryCosts).values(
    data.deliveryCostMatrix.map((row) => ({
      plantId: plantId.get(row.plant)!,
      branchId: branchId.get(row.branch)!,
      costPerLoad: String(row.costPerLoad),
      distanceKm: row.distanceKm,
    })),
  );

  await db.insert(customers).values(
    data.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      branchId: branchId.get(c.branch)!,
      type: c.type,
      joinDate: c.joinDate,
      loyaltyTier: c.loyaltyTier,
    })),
  );

  await db.insert(orders).values(
    data.orders.map((o) => ({
      id: o.id,
      customerId: o.customerId,
      branchId: branchId.get(o.branch)!,
      serviceId: o.serviceId,
      kg: o.kg,
      loads: o.loads,
      amount: String(o.amount),
      paymentMethod: o.paymentMethod,
      status: o.status,
      orderDate: o.orderDate,
      isPickup: o.isPickup,
    })),
  );

  await db.insert(branchMonthlyDemand).values(
    data.branchMonthlyDemand.map((d) => ({
      branchId: branchId.get(d.branch)!,
      monthNo: d.monthNo,
      loads: d.loads,
      monthLabel: d.monthLabel,
    })),
  );

  await db.insert(marketingCampaigns).values(
    data.marketingCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      branchId: branchId.get(c.branch)!,
      startDate: c.startDate,
      endDate: c.endDate,
      budget: String(c.budget),
      newCustomers: c.newCustomers,
      revenueGenerated: String(Math.round(c.revenueGenerated)),
    })),
  );

  await db.insert(plantDeliveries).values(
    data.plantDeliveries.map((d) => ({
      id: d.id,
      plantId: plantId.get(d.plant)!,
      branchId: branchId.get(d.branch)!,
      date: d.date,
      loads: d.loads,
      cost: String(d.cost),
      status: d.status,
    })),
  );

  await db.insert(appSettings).values({
    rushCostPerLoad: "150",
    storageCostPerLoad: "75",
    currency: "₱",
    units: "loads",
    validationMonths: 3,
  });

  await db.insert(costAssumptions).values([
    {
      name: "Standard operations",
      rushCostPerLoad: "150",
      storageCostPerLoad: "75",
      isActive: true,
    },
    {
      name: "Peak season",
      rushCostPerLoad: "200",
      storageCostPerLoad: "95",
      isActive: false,
    },
  ]);

  await db.insert(analystNotes).values([
    {
      page: "descriptive",
      branchId: branchId.get("Cebu City")!,
      title: "Cebu City volume is highly seasonal",
      body: "Monthly loads swing with the sin wave pattern in the recorded history. Plan staffing around the peaks rather than the annual average.",
      tag: "Insight",
      pinned: true,
      author: "Maria Santos",
    },
    {
      page: "predictive",
      branchId: branchId.get("Mandaue")!,
      title: "Mandaue ramp continues",
      body: "The near-linear growth makes the linear fit the most reliable candidate for next-quarter planning.",
      tag: "Action",
      pinned: true,
      author: "Juan Dela Cruz",
    },
    {
      page: "prescriptive",
      branchId: branchId.get("Talisay")!,
      title: "Watch Talisay's declining loads",
      body: "Loads are trending down month over month. Re-check marketing coverage before committing more delivery capacity.",
      tag: "Warning",
      pinned: false,
      author: "Pedro Garcia",
    },
    {
      page: "summary",
      branchId: null,
      title: "Quarterly review cadence",
      body: "Should the BA procedure run be reviewed with branch managers before the optimization step?",
      tag: "Question",
      pinned: false,
      author: "Admin User",
    },
  ]);

  await db.insert(savedViews).values([
    {
      name: "December 2024 · all branches",
      page: "descriptive",
      filtersJson: {
        preset: "monthly",
        anchor: "2024-12-01",
        branch: "all",
        service: "all",
        chartToggles: { combo: true, donut: true, services: true },
      },
      isDefault: true,
    },
    {
      name: "Mandaue workload outlook",
      page: "predictive",
      filtersJson: {
        branch: "Mandaue",
        horizon: "month",
        chartToggles: { orders: true, revenue: true },
      },
      isDefault: false,
    },
  ]);

  // One saved forecast run per branch, computed with the real engine.
  const demandByBranch = new Map<string, Array<{ monthNo: number; loads: number; monthLabel: string }>>();
  for (const row of data.branchMonthlyDemand) {
    const list = demandByBranch.get(row.branch) ?? [];
    list.push({ monthNo: row.monthNo, loads: row.loads, monthLabel: row.monthLabel });
    demandByBranch.set(row.branch, list);
  }

  const forecastSummaries: Array<{ branch: string; model: string; r2: number; mad: number }> = [];
  for (const branch of data.branches) {
    const history = demandByBranch.get(branch.name) ?? [];
    const forecast = runBranchForecast({ history, horizon: 3, validationMonths: 3, model: "auto" });
    const [run] = await db
      .insert(forecastRuns)
      .values({
        name: `${branch.name} · auto forecast`,
        branchId: branch.id,
        model: "auto",
        horizon: 3,
        trainingEnd: history[history.length - 1].monthLabel + "-01",
        validationMonths: 3,
        r2: String(forecast.r2.toFixed(4)),
        mad: String(forecast.mad.toFixed(2)),
        status: "Approved",
        notes: `Best-fit model: ${forecast.model}. Validation MAD computed on the latest three months.`,
      })
      .returning({ id: forecastRuns.id });

    await db.insert(forecastResults).values(
      forecast.forecast.map((point) => ({
        forecastRunId: run.id,
        monthNo: point.monthNo,
        forecastLoads: String(point.forecastLoads),
        lower: String(point.lower),
        upper: String(point.upper),
      })),
    );

    forecastSummaries.push({
      branch: branch.name,
      model: forecast.model,
      r2: forecast.r2,
      mad: forecast.mad,
    });
  }

  await db.insert(modelOverrides).values({
    branchId: branchId.get("Talisay")!,
    chosenModel: "linear",
    reason: "The decline is steady; higher-order curves overfit the noisy last quarter.",
    active: true,
  });

  // Two solved scenarios built from the seeded capacity, demand and lane costs.
  const demandMap = latestDemandByBranch(
    data.branchMonthlyDemand.map((d) => ({
      branchId: branchId.get(d.branch)!,
      monthNo: d.monthNo,
      loads: d.loads,
    })),
  );
  const costRows = data.deliveryCostMatrix.map((row) => ({
    plantId: plantId.get(row.plant)!,
    branchId: branchId.get(row.branch)!,
    costPerLoad: row.costPerLoad,
  }));
  const scenarioBranches = data.branches.map((b) => ({ id: b.id, name: b.name }));
  const scenarioPlants = data.plants.map((p) => ({
    id: p.id,
    name: p.name,
    capacity: p.monthlyCapacity,
  }));

  const scenarioSeeds = [
    {
      name: "Baseline plan",
      description: "Current capacity, current lane costs and forecast demand with no adjustments.",
      fuelCostPct: 0,
      demandPct: 0,
      capacityPct: 0,
      baselineMethod: "proportional" as const,
      demandSource: "forecast" as const,
    },
    {
      name: "Peak-season stress test",
      description: "Fuel up 8%, demand up 10% and plant capacity down 5% for the holiday peak.",
      fuelCostPct: 8,
      demandPct: 10,
      capacityPct: -5,
      baselineMethod: "smoothing" as const,
      demandSource: "manual" as const,
    },
  ];

  let baselineSaving = 0;
  for (const seed of scenarioSeeds) {
    const plan = buildScenarioPlan({
      plants: scenarioPlants,
      branches: scenarioBranches,
      costs: costRows,
      demandByBranch: demandMap,
      config: seed,
    });
    baselineSaving = Math.max(baselineSaving, plan.savings);

    const [scenario] = await db
      .insert(optimizationScenarios)
      .values({
        name: seed.name,
        description: seed.description,
        fuelCostPct: String(seed.fuelCostPct),
        demandPct: String(seed.demandPct),
        capacityPct: String(seed.capacityPct),
        demandSource: seed.demandSource,
        status: "Solved",
        baselineMethod: seed.baselineMethod,
        totalCost: String(Math.round(plan.solution.totalCost)),
        baselineCost: String(Math.round(plan.baselineCost)),
        savingsAmount: String(Math.round(plan.savings)),
        savingsPct: String(plan.savingsPercent.toFixed(2)),
      })
      .returning({ id: optimizationScenarios.id });

    await db.insert(scenarioPlantSupply).values(
      plan.plants.map((plant) => ({
        scenarioId: scenario.id,
        plantId: plant.id,
        supply: String(plant.supply),
      })),
    );
    await db.insert(scenarioBranchDemand).values(
      plan.branches.map((branch) => ({
        scenarioId: scenario.id,
        branchId: branch.id,
        demand: String(branch.demand),
        isOverride: false,
      })),
    );
    await db.insert(scenarioCostMatrix).values(
      plan.plants.flatMap((plant, i) =>
        plan.branches.map((branch, j) => ({
          scenarioId: scenario.id,
          plantId: plant.id,
          branchId: branch.id,
          costPerLoad: String(plan.costs[i][j]),
        })),
      ),
    );
    await db.insert(shippingScheduleItems).values(
      plan.items.map((item) => ({
        scenarioId: scenario.id,
        plantId: item.plantId,
        branchId: item.branchId,
        loads: String(item.loads),
        unitCost: String(item.unitCost),
        totalCost: String(Math.round(item.totalCost)),
        status: "Planned" as const,
        isManualOverride: false,
      })),
    );
  }

  const latestMonth = 27;
  const [run] = await db
    .insert(baProcedureRuns)
    .values({
      monthNo: latestMonth,
      periodLabel: "March 2024",
      status: "In progress",
      owner: "Admin User",
      notes: "Demand data loaded; transportation model being reviewed with branch managers.",
    })
    .returning({ id: baProcedureRuns.id });

  const stepTitles = [
    "Collect costs",
    "Update monthly demand",
    "Check plant capacity",
    "Rerun curve fitting",
    "Forecast demand",
    "Build optimization model",
    "Solve and extract schedule",
  ];
  await db.insert(baProcedureSteps).values(
    stepTitles.map((title, i) => {
      const done = i < 5;
      const doneAt = done ? new Date(Date.now() - (stepTitles.length - i) * 86400000) : null;
      return {
        runId: run.id,
        stepNo: i + 1,
        title,
        done,
        doneAt,
        note:
          i === 1
            ? "Latest three months loaded for all six branches."
            : i === 5
              ? "Transportation model built from the current cost matrix."
              : null,
      };
    }),
  );

  const derived = buildRecommendations({
    orders: data.orders.map((o) => ({
      customerId: o.customerId,
      serviceId: o.serviceId,
      branchId: branchId.get(o.branch)!,
      amount: o.amount,
      status: o.status,
      orderDate: o.orderDate,
    })),
    services: data.services,
    demand: data.branchMonthlyDemand.map((d) => ({
      branchId: branchId.get(d.branch)!,
      branchName: d.branch,
      monthNo: d.monthNo,
      loads: d.loads,
    })),
  });

  const stageForCategory: Record<string, "Descriptive" | "Predictive" | "Prescriptive"> = {
    Operations: "Descriptive",
    Marketing: "Descriptive",
    Retention: "Descriptive",
    Capacity: "Predictive",
    Revenue: "Predictive",
  };

  await db.insert(baRecommendations).values([
    {
      title: "Apply the optimized plant-to-branch allocation",
      description:
        "Solving the transportation model against current capacity, forecast demand and lane costs lowers delivery spend without changing service levels.",
      priority: "High",
      relatedStep: "Prescriptive",
      owner: "Operations",
      dueDate: addDays(3),
      status: "Open",
      estimatedSavings: String(Math.round(baselineSaving)),
    },
    ...derived.slice(0, 5).map((rec, i) => ({
      title: rec.action,
      description: `${rec.reason} ${rec.benefit}`,
      priority: rec.priority,
      relatedStep: stageForCategory[rec.category] ?? "Descriptive",
      owner: rec.category,
      dueDate: addDays(i % 2 === 0 ? 7 : 14),
      status: "Open" as const,
      estimatedSavings: null,
    })),
  ]);

  await db.insert(baReports).values({
    title: "Capstone snapshot · March 2024",
    snapshotJson: {
      generatedAt: new Date().toISOString(),
      descriptive: {
        orders: data.orders.filter((o) => o.status !== "Cancelled").length,
        revenue: Math.round(
          data.orders.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.amount, 0),
        ),
        customers: data.customers.length,
        branches: data.branches.length,
        plants: data.plants.length,
      },
      models: forecastSummaries,
      optimization: {
        scenario: "Baseline plan",
        savings: Math.round(baselineSaving),
      },
    },
  });

  const countSql = TABLES.map(
    (table) => `SELECT '${table}' AS table, count(*)::int AS count FROM "${table}"`,
  ).join(" UNION ALL ");
  const counts = await pool.query<{ table: string; count: number }>(countSql);
  console.log("Seed complete. Row counts:");
  for (const row of [...counts.rows].sort((a, b) => a.table.localeCompare(b.table))) {
    console.log(`  ${row.table.padEnd(28)} ${row.count}`);
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error("Seed failed", error);
  await pool.end();
  process.exit(1);
});
