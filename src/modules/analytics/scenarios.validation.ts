import { z } from "zod";

const demandSources = z.enum(["forecast", "manual"]);
const statuses = z.enum(["Draft", "Solved", "Approved", "Archived"]);
const baselineMethods = z.enum(["proportional", "smoothing"]);

const supplyRow = z.object({
  plantId: z.string().min(1),
  supply: z.number().nonnegative(),
});

const demandRow = z.object({
  branchId: z.string().min(1),
  demand: z.number().nonnegative(),
  isOverride: z.boolean().default(false),
});

const costRow = z.object({
  plantId: z.string().min(1),
  branchId: z.string().min(1),
  costPerLoad: z.number().nonnegative(),
});

export const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).default(""),
  fuelCostPct: z.number().min(-100).max(500).default(0),
  demandPct: z.number().min(-100).max(500).default(0),
  capacityPct: z.number().min(-100).max(500).default(0),
  demandSource: demandSources.default("forecast"),
  baselineMethod: baselineMethods.default("proportional"),
  supply: z.array(supplyRow).optional(),
  demand: z.array(demandRow).optional(),
  costs: z.array(costRow).optional(),
});

export const scenarioUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  fuelCostPct: z.number().min(-100).max(500).optional(),
  demandPct: z.number().min(-100).max(500).optional(),
  capacityPct: z.number().min(-100).max(500).optional(),
  demandSource: demandSources.optional(),
  baselineMethod: baselineMethods.optional(),
  status: statuses.optional(),
  supply: z.array(supplyRow).optional(),
  demand: z.array(demandRow).optional(),
  costs: z.array(costRow).optional(),
});

export const scenarioQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().trim().min(1).optional(),
  status: statuses.optional(),
  sort: z.enum(["createdAt", "name", "savingsPct"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const approveSchema = z
  .object({
    writeDeliveries: z.boolean().default(false),
  })
  .default({ writeDeliveries: false });

export const duplicateSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
  })
  .default({});

export const compareQuerySchema = z.object({
  ids: z.string().min(1),
});
