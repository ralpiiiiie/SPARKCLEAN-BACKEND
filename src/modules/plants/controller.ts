import type { Request, Response } from "express";
import type { z } from "zod";
import type { ListQuery } from "../../utils/params.js";
import type { plantCreateSchema, plantUpdateSchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listPlants(req.valid.query as ListQuery));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getPlant(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof plantCreateSchema>;
  res.status(201).json(await service.createPlant(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  const body = req.valid.body as z.infer<typeof plantUpdateSchema>;
  res.json(await service.updatePlant(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deletePlant(id));
}
