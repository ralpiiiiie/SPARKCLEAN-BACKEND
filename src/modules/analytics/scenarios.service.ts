import { and, asc, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/client.js";
import {
  branches,
  branchMonthlyDemand,
  deliveryCosts,
  optimizationScenarios,
  plantDeliveries,
  plants,
  scenarioBranchDemand,
  scenarioCostMatrix,
  scenarioPlantSupply,
  shippingScheduleItems,
} from "../../db/schema/index.js";
import {
  compareWithBaseline,
  solveTransportationProblem,
} from "../../analytics/transportation.js";
import { latestDemandByBranch } from "../../analytics/scenario.js";
import { offsetOf, pageMeta } from "../../utils/params.js";
import { ApiError } from "../../utils/errors.js";
import { nextId } from "../../utils/ids.js";
import { toNumber } from "../../utils/numbers.js";
import type {
  approveSchema,
  duplicateSchema,
  scenarioCreateSchema,
  scenarioQuerySchema,
  scenarioUpdateSchema,
} from "./scenarios.validation.js";

type ScenarioQuery = z.infer<typeof scenarioQuerySchema>;
type ScenarioCreate = z.infer<typeof scenarioCreateSchema>;
type ScenarioUpdate = z.infer<typeof scenarioUpdateSchema>;
type ScenarioRow = typeof optimizationScenarios.$inferSelect;

const serializeScenario = (row: ScenarioRow) => ({
  ...row,
  fuelCostPct: toNumber(row.fuelCostPct),
  demandPct: toNumber(row.demandPct),
  capacityPct: toNumber(row.capacityPct),
  totalCost: row.totalCost === null ? null : toNumber(row.totalCost),
  baselineCost: row.baselineCost === null ? null : toNumber(row.baselineCost),
  savingsAmount: row.savingsAmount === null ? null : toNumber(row.savingsAmount),
  savingsPct: row.savingsPct === null ? null : toNumber(row.savingsPct),
});

const scheduleSelect = () =>
  db
    .select({
      id: shippingScheduleItems.id,
      scenarioId: shippingScheduleItems.scenarioId,
      plantId: shippingScheduleItems.plantId,
      plant: plants.name,
      branchId: shippingScheduleItems.branchId,
      branch: branches.name,
      loads: shippingScheduleItems.loads,
      unitCost: shippingScheduleItems.unitCost,
      totalCost: shippingScheduleItems.totalCost,
      status: shippingScheduleItems.status,
      isManualOverride: shippingScheduleItems.isManualOverride,
      createdAt: shippingScheduleItems.createdAt,
      updatedAt: shippingScheduleItems.updatedAt,
    })
    .from(shippingScheduleItems)
    .innerJoin(plants, eq(shippingScheduleItems.plantId, plants.id))
    .innerJoin(branches, eq(shippingScheduleItems.branchId, branches.id));

type ScheduleJoinRow = Awaited<ReturnType<typeof scheduleSelect>>[number];

const serializeSchedule = (row: ScheduleJoinRow) => ({
  ...row,
  loads: toNumber(row.loads),
  unitCost: toNumber(row.unitCost),
  totalCost: toNumber(row.totalCost),
});

async function scenarioInputs(scenarioId: number) {
  const [supplyRows, demandRows, costRows, schedule] = await Promise.all([
    db
      .select({
        plantId: scenarioPlantSupply.plantId,
        plant: plants.name,
        supply: scenarioPlantSupply.supply,
      })
      .from(scenarioPlantSupply)
      .innerJoin(plants, eq(scenarioPlantSupply.plantId, plants.id))
      .where(eq(scenarioPlantSupply.scenarioId, scenarioId))
      .orderBy(asc(plants.name)),
    db
      .select({
        branchId: scenarioBranchDemand.branchId,
        branch: branches.name,
        demand: scenarioBranchDemand.demand,
        isOverride: scenarioBranchDemand.isOverride,
      })
      .from(scenarioBranchDemand)
      .innerJoin(branches, eq(scenarioBranchDemand.branchId, branches.id))
      .where(eq(scenarioBranchDemand.scenarioId, scenarioId))
      .orderBy(asc(branches.name)),
    db
      .select({
        plantId: scenarioCostMatrix.plantId,
        branchId: scenarioCostMatrix.branchId,
        costPerLoad: scenarioCostMatrix.costPerLoad,
      })
      .from(scenarioCostMatrix)
      .where(eq(scenarioCostMatrix.scenarioId, scenarioId)),
    scheduleSelect()
      .where(eq(shippingScheduleItems.scenarioId, scenarioId))
      .orderBy(asc(plants.name), asc(branches.name)),
  ]);

  return {
    supply: supplyRows.map((row) => ({ ...row, supply: toNumber(row.supply) })),
    demand: demandRows.map((row) => ({ ...row, demand: toNumber(row.demand) })),
    costs: costRows.map((row) => ({ ...row, costPerLoad: toNumber(row.costPerLoad) })),
    schedule: schedule.map(serializeSchedule),
  };
}

export async function getScenario(id: number) {
  const [row] = await db
    .select()
    .from(optimizationScenarios)
    .where(eq(optimizationScenarios.id, id));
  if (!row) throw ApiError.notFound("Scenario not found");
  const inputs = await scenarioInputs(id);
  return { ...serializeScenario(row), ...inputs };
}

export async function listScenarios(query: ScenarioQuery) {
  const conditions: SQL[] = [];
  if (query.status) conditions.push(eq(optimizationScenarios.status, query.status));
  if (query.search) conditions.push(ilike(optimizationScenarios.name, `%${query.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  const column =
    query.sort === "name"
      ? optimizationScenarios.name
      : query.sort === "savingsPct"
        ? optimizationScenarios.savingsPct
        : optimizationScenarios.createdAt;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(optimizationScenarios)
      .where(where)
      .orderBy(query.order === "asc" ? asc(column) : desc(column))
      .limit(query.pageSize)
      .offset(offsetOf(query.page, query.pageSize)),
    db.select({ value: count() }).from(optimizationScenarios).where(where),
  ]);

  return {
    data: rows.map(serializeScenario),
    ...pageMeta(totalRows[0].value, query.page, query.pageSize),
  };
}

interface BaseInputs {
  plantRows: Array<{ id: string; name: string; monthlyCapacity: number }>;
  branchRows: Array<{ id: string; name: string }>;
  demandByBranch: Map<string, number>;
  costs: Map<string, number>;
}

async function currentBase(): Promise<BaseInputs> {
  const [plantRows, branchRows, demandRows, costRows] = await Promise.all([
    db.select().from(plants).orderBy(asc(plants.name)),
    db.select().from(branches).orderBy(asc(branches.name)),
    db
      .select({
        branchId: branchMonthlyDemand.branchId,
        monthNo: branchMonthlyDemand.monthNo,
        loads: branchMonthlyDemand.loads,
      })
      .from(branchMonthlyDemand),
    db.select().from(deliveryCosts),
  ]);
  return {
    plantRows: plantRows.map((row) => ({
      id: row.id,
      name: row.name,
      monthlyCapacity: row.monthlyCapacity,
    })),
    branchRows: branchRows.map((row) => ({ id: row.id, name: row.name })),
    demandByBranch: latestDemandByBranch(demandRows),
    costs: new Map(
      costRows.map((row) => [
        `${row.plantId}:${row.branchId}`,
        toNumber(row.costPerLoad),
      ]),
    ),
  };
}

/** Populates scenario inputs from current data, applying the percentage levers. */
async function derivedInputs(config: {
  capacityPct: number;
  demandPct: number;
  fuelCostPct: number;
}) {
  const base = await currentBase();
  const capacityFactor = 1 + config.capacityPct / 100;
  const demandFactor = 1 + config.demandPct / 100;
  const fuelFactor = 1 + config.fuelCostPct / 100;

  return {
    supply: base.plantRows.map((plant) => ({
      plantId: plant.id,
      supply: Math.max(0, Math.round(plant.monthlyCapacity * capacityFactor)),
    })),
    demand: base.branchRows.map((branch) => ({
      branchId: branch.id,
      demand: Math.max(
        0,
        Math.round((base.demandByBranch.get(branch.id) ?? 0) * demandFactor),
      ),
      isOverride: false,
    })),
    costs: base.plantRows.flatMap((plant) =>
      base.branchRows.map((branch) => ({
        plantId: plant.id,
        branchId: branch.id,
        costPerLoad: Math.max(
          0,
          Math.round((base.costs.get(`${plant.id}:${branch.id}`) ?? 10) * fuelFactor),
        ),
      })),
    ),
  };
}

async function mergeInputs(input: ScenarioCreate) {
  const derived = await derivedInputs(input);
  return {
    supply: input.supply ?? derived.supply,
    demand: input.demand ?? derived.demand,
    costs: input.costs ?? derived.costs,
  };
}

async function writeInputs(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  scenarioId: number,
  inputs: Awaited<ReturnType<typeof mergeInputs>>,
) {
  await tx.delete(scenarioPlantSupply).where(eq(scenarioPlantSupply.scenarioId, scenarioId));
  await tx.delete(scenarioBranchDemand).where(eq(scenarioBranchDemand.scenarioId, scenarioId));
  await tx.delete(scenarioCostMatrix).where(eq(scenarioCostMatrix.scenarioId, scenarioId));

  if (inputs.supply.length) {
    await tx.insert(scenarioPlantSupply).values(
      inputs.supply.map((row) => ({
        scenarioId,
        plantId: row.plantId,
        supply: String(row.supply),
      })),
    );
  }
  if (inputs.demand.length) {
    await tx.insert(scenarioBranchDemand).values(
      inputs.demand.map((row) => ({
        scenarioId,
        branchId: row.branchId,
        demand: String(row.demand),
        isOverride: row.isOverride,
      })),
    );
  }
  if (inputs.costs.length) {
    await tx.insert(scenarioCostMatrix).values(
      inputs.costs.map((row) => ({
        scenarioId,
        plantId: row.plantId,
        branchId: row.branchId,
        costPerLoad: String(row.costPerLoad),
      })),
    );
  }
}

export async function createScenario(input: ScenarioCreate) {
  const inputs = await mergeInputs(input);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(optimizationScenarios)
      .values({
        name: input.name,
        description: input.description,
        fuelCostPct: String(input.fuelCostPct),
        demandPct: String(input.demandPct),
        capacityPct: String(input.capacityPct),
        demandSource: input.demandSource,
        baselineMethod: input.baselineMethod,
      })
      .returning({ id: optimizationScenarios.id });
    await writeInputs(tx, row.id, inputs);
    return row.id;
  });
  return getScenario(id);
}

export async function updateScenario(id: number, patch: ScenarioUpdate) {
  const [existing] = await db
    .select()
    .from(optimizationScenarios)
    .where(eq(optimizationScenarios.id, id));
  if (!existing) throw ApiError.notFound("Scenario not found");

  const hasRows = patch.supply || patch.demand || patch.costs;
  await db.transaction(async (tx) => {
    await tx
      .update(optimizationScenarios)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.fuelCostPct !== undefined ? { fuelCostPct: String(patch.fuelCostPct) } : {}),
        ...(patch.demandPct !== undefined ? { demandPct: String(patch.demandPct) } : {}),
        ...(patch.capacityPct !== undefined ? { capacityPct: String(patch.capacityPct) } : {}),
        ...(patch.demandSource !== undefined ? { demandSource: patch.demandSource } : {}),
        ...(patch.baselineMethod !== undefined
          ? { baselineMethod: patch.baselineMethod }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(optimizationScenarios.id, id));
    if (hasRows) {
      const current = await scenarioInputs(id);
      await writeInputs(tx, id, {
        supply: patch.supply ?? current.supply.map(({ plantId, supply }) => ({ plantId, supply })),
        demand:
          patch.demand ??
          current.demand.map(({ branchId, demand, isOverride }) => ({
            branchId,
            demand,
            isOverride,
          })),
        costs:
          patch.costs ??
          current.costs.map(({ plantId, branchId, costPerLoad }) => ({
            plantId,
            branchId,
            costPerLoad,
          })),
      });
    }
  });
  return getScenario(id);
}

interface SolveModel {
  plantRows: Array<{ id: string; name: string }>;
  branchRows: Array<{ id: string; name: string }>;
  supply: number[];
  demand: number[];
  matrix: number[][];
}

async function buildSolveModel(scenarioId: number): Promise<SolveModel> {
  const [base, inputs] = await Promise.all([currentBase(), scenarioInputs(scenarioId)]);
  const plantRows = base.plantRows;
  const branchRows = base.branchRows;

  const supplyMap = new Map(inputs.supply.map((row) => [row.plantId, row.supply]));
  const demandMap = new Map(inputs.demand.map((row) => [row.branchId, row.demand]));
  const costMap = new Map(
    inputs.costs.map((row) => [`${row.plantId}:${row.branchId}`, row.costPerLoad]),
  );

  const supply = plantRows.map((plant) =>
    Math.max(0, Math.round(supplyMap.get(plant.id) ?? plant.monthlyCapacity)),
  );
  const totalSupply = supply.reduce((sum, value) => sum + value, 0);

  const rawDemand = branchRows.map((branch) =>
    Math.max(0, Math.round(demandMap.get(branch.id) ?? base.demandByBranch.get(branch.id) ?? 0)),
  );
  const totalDemand = rawDemand.reduce((sum, value) => sum + value, 0);
  const demand = rawDemand.map((value) =>
    totalDemand ? Math.round((value / totalDemand) * totalSupply) : 0,
  );
  const diff = totalSupply - demand.reduce((sum, value) => sum + value, 0);
  if (demand.length) demand[demand.length - 1] += diff;

  const matrix = plantRows.map((plant) =>
    branchRows.map((branch) =>
      Math.max(
        0,
        Math.round(costMap.get(`${plant.id}:${branch.id}`) ?? base.costs.get(`${plant.id}:${branch.id}`) ?? 10),
      ),
    ),
  );

  return { plantRows, branchRows, supply, demand, matrix };
}

export async function solveScenario(id: number) {
  const [scenario] = await db
    .select()
    .from(optimizationScenarios)
    .where(eq(optimizationScenarios.id, id));
  if (!scenario) throw ApiError.notFound("Scenario not found");

  const model = await buildSolveModel(id);
  const totalSupply = model.supply.reduce((sum, value) => sum + value, 0);
  if (totalSupply <= 0) {
    throw ApiError.badRequest("Scenario has no plant capacity to allocate", "EMPTY_SUPPLY");
  }

  const solution = solveTransportationProblem({
    supply: model.supply,
    demand: model.demand,
    costs: model.matrix,
  });
  if (!solution.isFeasible) {
    throw ApiError.badRequest("Scenario model is infeasible", "INFEASIBLE_MODEL");
  }
  const comparison = compareWithBaseline(solution, model.supply, model.demand, model.matrix);

  const items: Array<{
    plantId: string;
    branchId: string;
    loads: number;
    unitCost: number;
    totalCost: number;
  }> = [];
  model.plantRows.forEach((plant, i) => {
    model.branchRows.forEach((branch, j) => {
      const loads = solution.allocations[i][j];
      if (loads > 0) {
        const unitCost = model.matrix[i][j];
        items.push({
          plantId: plant.id,
          branchId: branch.id,
          loads,
          unitCost,
          totalCost: loads * unitCost,
        });
      }
    });
  });

  await db.transaction(async (tx) => {
    await tx
      .delete(shippingScheduleItems)
      .where(eq(shippingScheduleItems.scenarioId, id));
    if (items.length) {
      await tx.insert(shippingScheduleItems).values(
        items.map((item) => ({
          scenarioId: id,
          plantId: item.plantId,
          branchId: item.branchId,
          loads: String(item.loads),
          unitCost: String(item.unitCost),
          totalCost: String(item.totalCost),
        })),
      );
    }
    await tx
      .update(optimizationScenarios)
      .set({
        totalCost: String(Math.round(solution.totalCost)),
        baselineCost: String(Math.round(comparison.baselineCost)),
        savingsAmount: String(Math.round(comparison.savings)),
        savingsPct: comparison.savingsPercent.toFixed(2),
        status: scenario.status === "Approved" ? "Approved" : "Solved",
        updatedAt: new Date(),
      })
      .where(eq(optimizationScenarios.id, id));
  });

  return getScenario(id);
}

export async function duplicateScenario(id: number, input: z.infer<typeof duplicateSchema>) {
  const source = await getScenario(id);
  return createScenario({
    name: input.name ?? `${source.name} (copy)`,
    description: source.description,
    fuelCostPct: source.fuelCostPct,
    demandPct: source.demandPct,
    capacityPct: source.capacityPct,
    demandSource: source.demandSource,
    baselineMethod: source.baselineMethod,
    supply: source.supply.map(({ plantId, supply }) => ({ plantId, supply })),
    demand: source.demand.map(({ branchId, demand, isOverride }) => ({
      branchId,
      demand,
      isOverride,
    })),
    costs: source.costs.map(({ plantId, branchId, costPerLoad }) => ({
      plantId,
      branchId,
      costPerLoad,
    })),
  });
}

export async function approveScenario(id: number, input: z.infer<typeof approveSchema>) {
  const scenario = await getScenario(id);
  if (scenario.schedule.length === 0) {
    throw ApiError.badRequest("Solve the scenario before approving it", "NOT_SOLVED");
  }

  let deliveriesCreated = 0;
  await db.transaction(async (tx) => {
    await tx
      .update(optimizationScenarios)
      .set({ status: "Approved", updatedAt: new Date() })
      .where(eq(optimizationScenarios.id, id));
    if (input.writeDeliveries) {
      const firstId = await nextId("plant_deliveries", "id", "DEL", 4);
      let sequence = Number(firstId.slice(3));
      const today = new Date().toISOString().slice(0, 10);
      const rows = scenario.schedule.map((item) => {
        const deliveryId = `DEL${String(sequence).padStart(4, "0")}`;
        sequence += 1;
        return {
          id: deliveryId,
          plantId: item.plantId,
          branchId: item.branchId,
          date: today,
          loads: Math.round(item.loads),
          cost: String(Math.round(item.totalCost)),
          status: "In Transit" as const,
        };
      });
      if (rows.length) {
        await tx.insert(plantDeliveries).values(rows);
        deliveriesCreated = rows.length;
      }
    }
  });

  return { scenario: await getScenario(id), deliveriesCreated };
}

export async function deleteScenario(id: number) {
  const [deleted] = await db
    .delete(optimizationScenarios)
    .where(eq(optimizationScenarios.id, id))
    .returning({ id: optimizationScenarios.id });
  if (!deleted) throw ApiError.notFound("Scenario not found");
  return { id: deleted.id, deleted: true };
}

export async function compareScenarios(ids: number[]) {
  if (ids.length < 2 || ids.length > 4) {
    throw ApiError.badRequest("Compare between 2 and 4 scenarios", "COMPARE_RANGE");
  }
  const rows = await db
    .select()
    .from(optimizationScenarios)
    .where(inArray(optimizationScenarios.id, ids));
  if (rows.length !== ids.length) throw ApiError.notFound("One or more scenarios were not found");

  const details = await Promise.all(ids.map((id) => getScenario(id)));
  return details.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    status: scenario.status,
    demandSource: scenario.demandSource,
    baselineMethod: scenario.baselineMethod,
    fuelCostPct: scenario.fuelCostPct,
    demandPct: scenario.demandPct,
    capacityPct: scenario.capacityPct,
    totalCost: scenario.totalCost,
    baselineCost: scenario.baselineCost,
    savingsAmount: scenario.savingsAmount,
    savingsPct: scenario.savingsPct,
    totalSupply: scenario.supply.reduce((sum, row) => sum + row.supply, 0),
    totalDemand: scenario.demand.reduce((sum, row) => sum + row.demand, 0),
    scheduleItems: scenario.schedule.length,
    supply: scenario.supply,
    demand: scenario.demand,
  }));
}
