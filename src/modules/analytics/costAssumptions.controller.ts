import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  costAssumptionCreateSchema,
  costAssumptionUpdateSchema,
} from "./costAssumptions.validation.js";
import * as service from "./costAssumptions.service.js";

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await service.listCostAssumptions());
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getCostAssumption(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await service.createCostAssumption(
        req.valid.body as z.infer<typeof costAssumptionCreateSchema>,
      ),
    );
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateCostAssumption(
      id,
      req.valid.body as z.infer<typeof costAssumptionUpdateSchema>,
    ),
  );
}

export async function activate(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.activateCostAssumption(id));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteCostAssumption(id));
}
