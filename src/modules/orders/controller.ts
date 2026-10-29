import type { Request, Response } from "express";
import type { z } from "zod";
import type { orderCreateSchema, orderQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listOrders(req.valid.query as z.infer<typeof orderQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getOrder(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof orderCreateSchema>;
  res.status(201).json(await service.createOrder(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  const body = req.valid.body as Partial<z.infer<typeof orderCreateSchema>>;
  res.json(await service.updateOrder(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deleteOrder(id));
}
