import { z } from "zod";

export const descriptiveQuerySchema = z.object({
  branchId: z.string().optional(),
});

export const performanceQuerySchema = z.object({
  rushCostPerLoad: z.coerce.number().nonnegative().optional(),
  storageCostPerLoad: z.coerce.number().nonnegative().optional(),
});

const costRow = z.object({
  plantId: z.string().min(1),
  branchId: z.string().min(1),
  costPerLoad: z.number().nonnegative(),
});

export const optimizeSchema = z.object({
  plantIds: z.array(z.string().min(1)).optional(),
  branchIds: z.array(z.string().min(1)).optional(),
  supplyByPlant: z.record(z.string(), z.number().nonnegative()).optional(),
  demandByBranch: z.record(z.string(), z.number().nonnegative()).optional(),
  costs: z.array(costRow).optional(),
  fuelCostPct: z.number().min(-100).max(500).default(0),
  demandPct: z.number().min(-100).max(500).default(0),
  capacityPct: z.number().min(-100).max(500).default(0),
});
