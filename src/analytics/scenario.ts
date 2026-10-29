import {
  compareWithBaseline,
  solveTransportationProblem,
  type TransportationSolution,
} from "./transportation.js";

export interface ScenarioPlant {
  id: string;
  name: string;
  capacity: number;
}

export interface ScenarioBranch {
  id: string;
  name: string;
}

export interface ScenarioCost {
  plantId: string;
  branchId: string;
  costPerLoad: number;
}

export interface ScenarioConfig {
  fuelCostPct: number;
  demandPct: number;
  capacityPct: number;
  baselineMethod: "proportional" | "smoothing";
}

export interface ScenarioPlan {
  plants: Array<{ id: string; name: string; supply: number }>;
  branches: Array<{ id: string; name: string; demand: number }>;
  costs: number[][];
  solution: TransportationSolution;
  baselineCost: number;
  savings: number;
  savingsPercent: number;
  items: Array<{
    plantId: string;
    branchId: string;
    loads: number;
    unitCost: number;
    totalCost: number;
  }>;
}

const avg3 = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const window = sorted.slice(-3);
  return window.length ? window.reduce((s, v) => s + v, 0) / window.length : 0;
};

/** Base demand per branch: mean of the latest three recorded months. */
export function latestDemandByBranch(
  demand: Array<{ branchId: string; monthNo: number; loads: number }>,
): Map<string, number> {
  const grouped = new Map<string, Array<{ monthNo: number; loads: number }>>();
  for (const row of demand) {
    const list = grouped.get(row.branchId) ?? [];
    list.push({ monthNo: row.monthNo, loads: row.loads });
    grouped.set(row.branchId, list);
  }
  const out = new Map<string, number>();
  for (const [branchId, rows] of grouped) {
    rows.sort((a, b) => a.monthNo - b.monthNo);
    out.set(branchId, avg3(rows.map((r) => r.loads)));
  }
  return out;
}

/**
 * Builds the transportation model for a scenario. Demand is scaled by the
 * demand %, supply by the capacity %, and lane costs by the fuel %.
 */
export function buildScenarioPlan(input: {
  plants: ScenarioPlant[];
  branches: ScenarioBranch[];
  costs: ScenarioCost[];
  demandByBranch: Map<string, number>;
  config: ScenarioConfig;
}): ScenarioPlan {
  const { plants, branches, costs, demandByBranch, config } = input;
  const capacityFactor = 1 + config.capacityPct / 100;
  const fuelFactor = 1 + config.fuelCostPct / 100;

  const supply = plants.map((plant) =>
    Math.max(0, Math.round(plant.capacity * capacityFactor)),
  );
  const totalSupply = supply.reduce((a, b) => a + b, 0);

  const rawDemand = branches.map(
    (branch) => (demandByBranch.get(branch.id) ?? 0) * (1 + config.demandPct / 100),
  );
  const totalDemand = rawDemand.reduce((a, b) => a + b, 0);

  // Rescale demand proportionally so the model stays balanced, pushing the
  // rounding remainder onto the final branch — same approach as Phase 1.
  const demand = rawDemand.map((value) =>
    totalDemand ? Math.round((value / totalDemand) * totalSupply) : 0,
  );
  const diff = totalSupply - demand.reduce((a, b) => a + b, 0);
  if (demand.length) demand[demand.length - 1] += diff;

  const matrix = plants.map((plant) =>
    branches.map((branch) => {
      const row = costs.find((c) => c.plantId === plant.id && c.branchId === branch.id);
      return Math.max(0, Math.round((row?.costPerLoad ?? 10) * fuelFactor));
    }),
  );

  const solution = solveTransportationProblem({ supply, demand, costs: matrix });
  const comparison = compareWithBaseline(solution, supply, demand, matrix);

  const items: ScenarioPlan["items"] = [];
  plants.forEach((plant, i) => {
    branches.forEach((branch, j) => {
      const loads = solution.allocations[i][j];
      if (loads > 0) {
        const unitCost = matrix[i][j];
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

  return {
    plants: plants.map((plant, i) => ({ id: plant.id, name: plant.name, supply: supply[i] })),
    branches: branches.map((branch, i) => ({
      id: branch.id,
      name: branch.name,
      demand: demand[i],
    })),
    costs: matrix,
    solution,
    baselineCost: comparison.baselineCost,
    savings: comparison.savings,
    savingsPercent: comparison.savingsPercent,
    items,
  };
}
