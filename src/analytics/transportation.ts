export interface TransportationInput {
  supply: number[];
  demand: number[];
  costs: number[][];
}

export interface TransportationSolution {
  allocations: number[][];
  totalCost: number;
  isFeasible: boolean;
}

/**
 * Greedy least-cost allocation matching the Phase 1 frontend solver so the
 * backend and the mock fallback report identical schedules.
 */
export function solveTransportationProblem(input: TransportationInput): TransportationSolution {
  const { supply, demand, costs } = input;
  const numPlants = supply.length;
  const numBranches = demand.length;
  const totalSupply = supply.reduce((a, b) => a + b, 0);
  const totalDemand = demand.reduce((a, b) => a + b, 0);

  if (Math.abs(totalSupply - totalDemand) > 0.01) {
    return {
      allocations: Array.from({ length: numPlants }, () => Array<number>(numBranches).fill(0)),
      totalCost: 0,
      isFeasible: false,
    };
  }

  const allocations = Array.from({ length: numPlants }, () => Array<number>(numBranches).fill(0));
  const remainingSupply = [...supply];
  const remainingDemand = [...demand];
  const usedPlants = new Set<number>();
  const usedBranches = new Set<number>();

  const cells: Array<{ plant: number; branch: number; cost: number }> = [];
  for (let i = 0; i < numPlants; i += 1) {
    for (let j = 0; j < numBranches; j += 1) {
      cells.push({ plant: i, branch: j, cost: costs[i][j] });
    }
  }
  cells.sort((a, b) => a.cost - b.cost);

  for (const cell of cells) {
    const { plant, branch } = cell;
    if (usedPlants.has(plant) || usedBranches.has(branch)) continue;
    const supplyLeft = remainingSupply[plant];
    const demandLeft = remainingDemand[branch];
    if (supplyLeft <= 0 || demandLeft <= 0) {
      if (supplyLeft <= 0) usedPlants.add(plant);
      if (demandLeft <= 0) usedBranches.add(branch);
      continue;
    }
    const allocation = Math.min(supplyLeft, demandLeft);
    allocations[plant][branch] = allocation;
    remainingSupply[plant] -= allocation;
    remainingDemand[branch] -= allocation;
    if (remainingSupply[plant] <= 0) usedPlants.add(plant);
    if (remainingDemand[branch] <= 0) usedBranches.add(branch);
  }

  let totalCost = 0;
  for (let i = 0; i < numPlants; i += 1) {
    for (let j = 0; j < numBranches; j += 1) {
      totalCost += allocations[i][j] * costs[i][j];
    }
  }

  return { allocations, totalCost, isFeasible: true };
}

export function compareWithBaseline(
  solution: TransportationSolution,
  supply: number[],
  demand: number[],
  costs: number[][],
): { savings: number; savingsPercent: number; baselineCost: number } {
  const numPlants = supply.length;
  const numBranches = demand.length;
  const totalSupply = supply.reduce((a, b) => a + b, 0);
  let baselineCost = 0;
  for (let i = 0; i < numPlants; i += 1) {
    for (let j = 0; j < numBranches; j += 1) {
      const plantShare = totalSupply ? supply[i] / totalSupply : 0;
      baselineCost += demand[j] * plantShare * costs[i][j];
    }
  }
  const savings = baselineCost - solution.totalCost;
  const savingsPercent = baselineCost ? (savings / baselineCost) * 100 : 0;
  return { savings, savingsPercent, baselineCost };
}
