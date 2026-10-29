import type { Request, Response } from "express";
import type { z } from "zod";
import type { campaignCreateSchema, campaignQuerySchema } from "./validation.js";
import * as service from "./service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listCampaigns(req.valid.query as z.infer<typeof campaignQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.getCampaign(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof campaignCreateSchema>;
  res.status(201).json(await service.createCampaign(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  const body = req.valid.body as Partial<z.infer<typeof campaignCreateSchema>>;
  res.json(await service.updateCampaign(id, body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: string };
  res.json(await service.deleteCampaign(id));
}
