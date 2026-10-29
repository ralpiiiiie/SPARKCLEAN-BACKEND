import type { Request, Response } from "express";
import type { z } from "zod";
import type { customerCreateSchema, customerQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listCustomers(req.valid.query as z.infer<typeof customerQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getCustomer(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof customerCreateSchema>;
  res.status(201).json(await service.createCustomer(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  const body = req.valid.body as Partial<z.infer<typeof customerCreateSchema>>;
  res.json(await service.updateCustomer(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deleteCustomer(id));
}
