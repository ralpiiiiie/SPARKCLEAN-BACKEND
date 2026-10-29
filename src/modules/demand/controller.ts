import type { Request, Response } from "express";
import type { z } from "zod";
import type { demandCreateSchema, demandQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listDemand(req.valid.query as z.infer<typeof demandQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getDemand(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof demandCreateSchema>;
  res.status(201).json(await service.createDemand(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  const body = req.valid.body as Partial<z.infer<typeof demandCreateSchema>>;
  res.json(await service.updateDemand(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteDemand(id));
}
