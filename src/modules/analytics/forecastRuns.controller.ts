import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  forecastRunCreateSchema,
  forecastRunQuerySchema,
  forecastRunUpdateSchema,
} from "./forecastRuns.validation.js";
import * as service from "./forecastRuns.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listRuns(req.valid.query as z.infer<typeof forecastRunQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getRun(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createRun(req.valid.body as z.infer<typeof forecastRunCreateSchema>));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateRun(id, req.valid.body as z.infer<typeof forecastRunUpdateSchema>),
  );
}

export async function rerun(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.rerunRun(id));
}

export async function duplicate(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.status(201).json(await service.duplicateRun(id));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteRun(id));
}
