import type { Request, Response } from "express";
import type { z } from "zod";
import type { deliveryCreateSchema, deliveryQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listDeliveries(req.valid.query as z.infer<typeof deliveryQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getDelivery(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof deliveryCreateSchema>;
  res.status(201).json(await service.createDelivery(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  const body = req.valid.body as Partial<z.infer<typeof deliveryCreateSchema>>;
  res.json(await service.updateDelivery(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deleteDelivery(id));
}
