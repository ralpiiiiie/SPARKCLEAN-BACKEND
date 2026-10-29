import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  savedViewCreateSchema,
  savedViewQuerySchema,
} from "./savedViews.validation.js";
import * as service from "./savedViews.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listSavedViews(req.valid.query as z.infer<typeof savedViewQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getSavedView(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createSavedView(req.valid.body as z.infer<typeof savedViewCreateSchema>));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateSavedView(
      id,
      req.valid.body as Partial<z.infer<typeof savedViewCreateSchema>>,
    ),
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteSavedView(id));
}
