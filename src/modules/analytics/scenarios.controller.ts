import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  approveSchema,
  compareQuerySchema,
  duplicateSchema,
  scenarioCreateSchema,
  scenarioQuerySchema,
  scenarioUpdateSchema,
} from "./scenarios.validation.js";
import * as service from "./scenarios.service.js";
import { ApiError } from "../../utils/errors.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listScenarios(req.valid.query as z.infer<typeof scenarioQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getScenario(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createScenario(req.valid.body as z.infer<typeof scenarioCreateSchema>));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateScenario(id, req.valid.body as z.infer<typeof scenarioUpdateSchema>),
  );
}

export async function solve(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.solveScenario(id));
}

export async function duplicate(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res
    .status(201)
    .json(
      await service.duplicateScenario(id, req.valid.body as z.infer<typeof duplicateSchema>),
    );
}

export async function approve(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.approveScenario(id, req.valid.body as z.infer<typeof approveSchema>));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteScenario(id));
}

export async function compare(req: Request, res: Response): Promise<void> {
  const { ids } = req.valid.query as z.infer<typeof compareQuerySchema>;
  const parsed = ids
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (parsed.length < 2) {
    throw ApiError.badRequest("Provide at least two scenario ids", "COMPARE_RANGE");
  }
  res.json(await service.compareScenarios(parsed));
}
