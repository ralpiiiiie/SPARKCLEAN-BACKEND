const base = process.env.API_URL ?? "http://localhost:4000/api/v1";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` :: ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, text };
}

const today = new Date().toISOString().slice(0, 10);

async function coreCrud() {
  const health = await req("GET", "/health");
  check("health", health.status === 200 && health.body.status === "ok", health.body);

  const branches = await req("GET", "/branches?pageSize=5000");
  check("branches list", branches.status === 200 && branches.body.total === 6, branches.body.total);

  const orders = await req("GET", "/orders?pageSize=1");
  check("orders pagination", orders.status === 200 && orders.body.total >= 600, orders.body.total);

  const demand = await req("GET", "/demand?branchId=BR001&pageSize=500");
  check("demand filter", demand.status === 200 && demand.body.total > 0, demand.body.total);

  const costs = await req("GET", "/delivery-costs");
  check("delivery costs list", costs.status === 200 && costs.body.length === 12, costs.body.length);

  const settings = await req("GET", "/settings");
  check("settings get", settings.status === 200 && settings.body.currency === "₱", settings.body);
  const updated = await req("PUT", "/settings", { rushCostPerLoad: 151 });
  check("settings update", updated.status === 200 && updated.body.rushCostPerLoad === 151, updated.body);
  await req("PUT", "/settings", { rushCostPerLoad: settings.body.rushCostPerLoad });

  const summary = await req("GET", "/dashboard/summary");
  check("dashboard summary", summary.status === 200 && summary.body.kpis.orders > 0, summary.body.kpis);

  // Customer + order lifecycle
  const customer = await req("POST", "/customers", {
    name: "API Smoke Customer",
    phone: "09170000000",
    email: "smoke@example.com",
    address: "Test address",
    branchId: "BR001",
    type: "Individual",
    joinDate: today,
    loyaltyTier: "Bronze",
  });
  check("customer create", customer.status === 201 && customer.body.id?.startsWith("CUS"), customer.body);

  if (customer.status === 201) {
    const patched = await req("PATCH", `/customers/${customer.body.id}`, { loyaltyTier: "Silver" });
    check("customer update", patched.status === 200 && patched.body.loyaltyTier === "Silver", patched.body);

    const order = await req("POST", "/orders", {
      customerId: customer.body.id,
      branchId: "BR001",
      serviceId: "SV001",
      kg: 5,
      loads: 1,
      amount: 250.5,
      paymentMethod: "Cash",
      status: "Received",
      orderDate: today,
      isPickup: false,
    });
    check("order create", order.status === 201 && order.body.amount === 250.5, order.body);

    if (order.status === 201) {
      const orderPatch = await req("PATCH", `/orders/${order.body.id}`, { status: "Delivered" });
      check("order update", orderPatch.status === 200 && orderPatch.body.status === "Delivered", orderPatch.body);
      await req("DELETE", `/orders/${order.body.id}`);
    }
    await req("DELETE", `/customers/${customer.body.id}`);
  }

  const campaign = await req("POST", "/campaigns", {
    name: "API Smoke Campaign",
    channel: "Facebook",
    branchId: "BR002",
    startDate: today,
    endDate: today,
    budget: 1000,
    newCustomers: 3,
    revenueGenerated: 4500,
  });
  check("campaign create", campaign.status === 201, campaign.body);
  if (campaign.status === 201) {
    const campaignPatch = await req("PATCH", `/campaigns/${campaign.body.id}`, { budget: 1200 });
    check("campaign update", campaignPatch.status === 200 && campaignPatch.body.budget === 1200, campaignPatch.body);
    await req("DELETE", `/campaigns/${campaign.body.id}`);
  }

  const delivery = await req("POST", "/deliveries", {
    plantId: "PL001",
    branchId: "BR001",
    date: today,
    loads: 4,
    cost: 480,
    status: "Completed",
  });
  check("delivery create", delivery.status === 201, delivery.body);
  if (delivery.status === 201) {
    const deliveryPatch = await req("PATCH", `/deliveries/${delivery.body.id}`, { status: "Delayed" });
    check("delivery update", deliveryPatch.status === 200 && deliveryPatch.body.status === "Delayed", deliveryPatch.body);
    await req("DELETE", `/deliveries/${delivery.body.id}`);
  }

  // Demand CRUD + uniqueness
  const demandRow = await req("POST", "/demand", {
    branchId: "BR006",
    monthNo: 999,
    loads: 500,
    monthLabel: "2024-12",
  });
  check("demand create", demandRow.status === 201, demandRow.body);
  if (demandRow.status === 201) {
    const duplicate = await req("POST", "/demand", {
      branchId: "BR006",
      monthNo: 999,
      loads: 600,
      monthLabel: "2024-12",
    });
    check("demand unique constraint", duplicate.status === 409, duplicate.body);

    const demandPatch = await req("PATCH", `/demand/${demandRow.body.id}`, { loads: 550 });
    check("demand update", demandPatch.status === 200 && demandPatch.body.loads === 550, demandPatch.body);

    const descriptive = await req("GET", "/analytics/descriptive?branchId=BR006");
    check(
      "descriptive reflects demand edit",
      descriptive.status === 200 &&
        descriptive.body.demand.records.some((row) => row.loads === 550),
      descriptive.body.demand?.records?.length,
    );
    await req("DELETE", `/demand/${demandRow.body.id}`);
  }

  const fk = await req("DELETE", "/branches/BR001");
  check("referenced branch delete returns 409", fk.status === 409, fk.body);
}

async function descriptiveAndForecast() {
  const descriptive = await req("GET", "/analytics/descriptive");
  check(
    "descriptive analytics",
    descriptive.status === 200 &&
      descriptive.body.totals.demandRecords === 162 &&
      descriptive.body.branches.length === 6 &&
      descriptive.body.branches.every((row) => row.fits.length === 3),
    descriptive.body.totals,
  );

  const forecast = await req("GET", "/analytics/forecast?branchId=BR001&model=auto&horizon=3");
  check(
    "forecast preview",
    forecast.status === 200 && forecast.body.forecast.length === 3 && forecast.body.models.length === 5,
    forecast.body.model,
  );
  check(
    "forecast validation MAD populated",
    forecast.body.models.every((fit) => Number.isFinite(fit.validationMad)),
    forecast.body.models?.map((fit) => fit.validationMad),
  );

  const predictive = await req("GET", "/analytics/predictive");
  check(
    "predictive analytics",
    predictive.status === 200 && predictive.body.workloads.length === 6,
    predictive.body.workloads?.length,
  );

  const run = await req("POST", "/analytics/forecast-runs", {
    name: "API smoke forecast",
    branchId: "BR002",
    model: "linear",
    horizon: 2,
    validationMonths: 3,
    notes: "smoke test",
  });
  check("forecast run create", run.status === 201 && run.body.results.length === 2, run.body);

  if (run.status === 201) {
    const rerun = await req("POST", `/analytics/forecast-runs/${run.body.id}/rerun`);
    check("forecast run rerun", rerun.status === 200 && rerun.body.results.length === 2, rerun.body);

    const duplicate = await req("POST", `/analytics/forecast-runs/${run.body.id}/duplicate`, {});
    check("forecast run duplicate", duplicate.status === 201 && duplicate.body.name.includes("(copy)"), duplicate.body);
    if (duplicate.status === 201) {
      const patch = await req("PATCH", `/analytics/forecast-runs/${duplicate.body.id}`, {
        status: "Approved",
        notes: "approved for smoke test",
      });
      check("forecast run update", patch.status === 200 && patch.body.status === "Approved", patch.body);
      await req("DELETE", `/analytics/forecast-runs/${duplicate.body.id}`);
    }
    await req("DELETE", `/analytics/forecast-runs/${run.body.id}`);
  }

  const override = await req("POST", "/analytics/model-overrides", {
    branchId: "BR005",
    chosenModel: "quadratic",
    reason: "Smoke test override",
    active: true,
  });
  check("model override upsert", override.status === 201, override.body);
  if (override.status === 201) {
    const overridden = await req("GET", "/analytics/forecast?branchId=BR005&model=auto&horizon=2");
    check(
      "override applied downstream",
      overridden.status === 200 && overridden.body.model === "quadratic" && overridden.body.overridden === true,
      overridden.body,
    );
    await req("DELETE", `/analytics/model-overrides/${override.body.id}`);
  }
}

async function prescriptive() {
  const scenario = await req("POST", "/analytics/scenarios", {
    name: "API smoke scenario",
    description: "Smoke test",
    fuelCostPct: 0,
    demandPct: 0,
    capacityPct: 0,
    demandSource: "forecast",
    baselineMethod: "proportional",
  });
  check(
    "scenario create seeds inputs",
    scenario.status === 201 && scenario.body.supply.length === 2 && scenario.body.demand.length === 6 && scenario.body.costs.length === 12,
    scenario.body,
  );

  if (scenario.status === 201) {
    const solved = await req("POST", `/analytics/scenarios/${scenario.body.id}/solve`);
    check(
      "scenario solve",
      solved.status === 200 && solved.body.status === "Solved" && solved.body.schedule.length > 0,
      solved.body,
    );
    check(
      "scenario totals persisted",
      solved.body.totalCost > 0 && solved.body.baselineCost >= solved.body.totalCost,
      solved.body,
    );

    const item = solved.body.schedule[0];
    if (item) {
      const itemPatch = await req("PATCH", `/analytics/schedule-items/${item.id}`, {
        loads: item.loads + 1,
        status: "Dispatched",
      });
      check(
        "schedule item override",
        itemPatch.status === 200 && itemPatch.body.isManualOverride === true && itemPatch.body.status === "Dispatched",
        itemPatch.body,
      );
    }

    const compare = await req("GET", `/analytics/scenarios/compare?ids=1,2,${scenario.body.id}`);
    check("scenario compare", compare.status === 200 && compare.body.length === 3, compare.body);

    const approved = await req("POST", `/analytics/scenarios/${scenario.body.id}/approve`, {
      writeDeliveries: true,
    });
    check(
      "scenario approve writes deliveries",
      approved.status === 200 && approved.body.scenario.status === "Approved" && approved.body.deliveriesCreated > 0,
      approved.body,
    );

    const created = await req("GET", `/deliveries?dateFrom=${today}&dateTo=${today}&pageSize=500`);
    for (const row of created.body.data ?? []) {
      await req("DELETE", `/deliveries/${row.id}`);
    }

    const duplicate = await req("POST", `/analytics/scenarios/${scenario.body.id}/duplicate`, { name: "API smoke scenario copy" });
    check("scenario duplicate", duplicate.status === 201 && duplicate.body.supply.length === 2, duplicate.body);
    if (duplicate.status === 201) await req("DELETE", `/analytics/scenarios/${duplicate.body.id}`);

    await req("DELETE", `/analytics/scenarios/${scenario.body.id}`);
  }

  const optimize = await req("POST", "/analytics/optimize", { demandPct: 10, capacityPct: 5, fuelCostPct: 4 });
  check(
    "stateless optimize",
    optimize.status === 200 && optimize.body.items.length > 0 && optimize.body.baselineCost > 0,
    optimize.body,
  );

  const performance = await req("GET", "/analytics/performance-improvement");
  check(
    "performance improvement",
    performance.status === 200 &&
      performance.body.routing.savings >= 0 &&
      performance.body.rushCostPerLoad > 0,
    performance.body,
  );

  const assumption = await req("POST", "/analytics/cost-assumptions", {
    name: "API smoke assumption",
    rushCostPerLoad: 160,
    storageCostPerLoad: 80,
    isActive: false,
  });
  check("cost assumption create", assumption.status === 201, assumption.body);
  if (assumption.status === 201) {
    const active = await req("PATCH", `/analytics/cost-assumptions/${assumption.body.id}/activate`);
    check("cost assumption activate", active.status === 200 && active.body.isActive === true, active.body);
    const nowActive = await req("GET", "/analytics/cost-assumptions");
    check(
      "only one active assumption",
      nowActive.body.filter((row) => row.isActive).length === 1,
      nowActive.body,
    );
    await req("DELETE", `/analytics/cost-assumptions/${assumption.body.id}`);
    await req("PATCH", "/analytics/cost-assumptions/1/activate");
  }

  const note = await req("POST", "/analytics/notes", {
    page: "prescriptive",
    branchId: "BR001",
    title: "API smoke note",
    body: "Created by smoke test",
    tag: "Action",
    pinned: true,
  });
  check("note create", note.status === 201 && note.body.pinned === true, note.body);
  if (note.status === 201) {
    const pinned = await req("PATCH", `/analytics/notes/${note.body.id}`, { pinned: false });
    check("note update pin", pinned.status === 200 && pinned.body.pinned === false, pinned.body);
    await req("DELETE", `/analytics/notes/${note.body.id}`);
  }

  const view = await req("POST", "/analytics/saved-views", {
    name: "API smoke view",
    page: "descriptive",
    filtersJson: { preset: "monthly", branch: "all" },
    isDefault: false,
  });
  check("saved view create", view.status === 201, view.body);
  if (view.status === 201) {
    const renamed = await req("PATCH", `/analytics/saved-views/${view.body.id}`, { name: "API smoke view renamed" });
    check("saved view rename", renamed.status === 200 && renamed.body.name.includes("renamed"), renamed.body);
    await req("DELETE", `/analytics/saved-views/${view.body.id}`);
  }
}

async function baAndExport() {
  const run = await req("POST", "/ba/procedure-runs", {
    monthNo: 998,
    periodLabel: "Smoke period",
    status: "Not started",
    owner: "API Smoke",
  });
  check("procedure run create with 7 steps", run.status === 201 && run.body.steps.length === 7, run.body);

  if (run.status === 201) {
    const step = run.body.steps[0];
    const stepDone = await req("PATCH", `/ba/procedure-runs/${run.body.id}/steps/${step.id}`, {
      done: true,
      note: "smoke",
    });
    check("procedure step update", stepDone.status === 200 && stepDone.body.done === true, stepDone.body);

    const refreshed = await req("GET", `/ba/procedure-runs/${run.body.id}`);
    check("procedure run status syncs", refreshed.body.status === "In progress", refreshed.body.status);
    await req("DELETE", `/ba/procedure-runs/${run.body.id}`);
  }

  const suggestions = await req("GET", "/ba/recommendations/suggestions");
  check("recommendation suggestions", suggestions.status === 200 && suggestions.body.length > 0, suggestions.body.length);

  const recommendation = await req("POST", "/ba/recommendations", {
    title: "API smoke recommendation",
    description: "Smoke test",
    priority: "Low",
    relatedStep: "Descriptive",
  });
  check("recommendation create", recommendation.status === 201, recommendation.body);
  if (recommendation.status === 201) {
    const done = await req("PATCH", `/ba/recommendations/${recommendation.body.id}`, { status: "Done" });
    check("recommendation update", done.status === 200 && done.body.status === "Done", done.body);
    await req("DELETE", `/ba/recommendations/${recommendation.body.id}`);
  }

  const snapshot = await req("POST", "/ba/reports/snapshot", { title: "API smoke snapshot" });
  check("report snapshot", snapshot.status === 201 && snapshot.body.snapshotJson?.kpis?.orders > 0, snapshot.body);
  if (snapshot.status === 201) {
    const renamed = await req("PATCH", `/ba/reports/${snapshot.body.id}`, { title: "API smoke snapshot renamed" });
    check("report rename", renamed.status === 200 && renamed.body.title.includes("renamed"), renamed.body);
    await req("DELETE", `/ba/reports/${snapshot.body.id}`);
  }

  const csv = await req("GET", "/export/customers.csv");
  check(
    "csv export",
    csv.status === 200 && csv.text.startsWith("id,name,phone") && csv.text.split("\n").length > 100,
    csv.text.slice(0, 80),
  );

  const scenarioCsv = await req("GET", "/export/scenarios.csv");
  check("scenario csv export", scenarioCsv.status === 200 && scenarioCsv.text.startsWith("id,name,status"), scenarioCsv.text.slice(0, 60));

  const missing = await req("GET", "/unknown-route");
  check("unknown route 404 envelope", missing.status === 404 && missing.body.error?.code === "NOT_FOUND", missing.body);
}

async function main() {
  console.log(`Smoke testing ${base}\n`);
  await coreCrud();
  await descriptiveAndForecast();
  await prescriptive();
  await baAndExport();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("Failed:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
