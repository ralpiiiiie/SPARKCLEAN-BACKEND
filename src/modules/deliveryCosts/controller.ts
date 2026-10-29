import type { Request, Response } from "express";
import type { z } from "zod";
import type { deliveryCostCreateSchema, deliveryCostQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(
    await service.listDeliveryCosts(req.valid.query as z.infer<typeof deliveryCostQuerySchema>),
  );
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getDeliveryCost(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof deliveryCostCreateSchema>;
  res.status(201).json(await service.createDeliveryCost(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  const body = req.valid.body as Partial<z.infer<typeof deliveryCostCreateSchema>>;
  res.json(await service.updateDeliveryCost(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteDeliveryCost(id));
}
