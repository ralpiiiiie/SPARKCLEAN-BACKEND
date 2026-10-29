import type { Request, Response } from "express";
import type { z } from "zod";
import type { ListQuery } from "../../utils/params.js";
import type { serviceCreateSchema, serviceUpdateSchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listServices(req.valid.query as ListQuery));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getService(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof serviceCreateSchema>;
  res.status(201).json(await service.createService(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  const body = req.valid.body as z.infer<typeof serviceUpdateSchema>;
  res.json(await service.updateService(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deleteService(id));
}
