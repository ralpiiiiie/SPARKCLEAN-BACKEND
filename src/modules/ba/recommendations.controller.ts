import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  recommendationCreateSchema,
  recommendationQuerySchema,
} from "./recommendations.validation.js";
import * as service from "./recommendations.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(
    await service.listRecommendations(
      req.valid.query as z.infer<typeof recommendationQuerySchema>,
    ),
  );
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getRecommendation(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await service.createRecommendation(
        req.valid.body as z.infer<typeof recommendationCreateSchema>,
      ),
    );
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateRecommendation(
      id,
      req.valid.body as Partial<z.infer<typeof recommendationCreateSchema>>,
    ),
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteRecommendation(id));
}

export async function suggested(_req: Request, res: Response): Promise<void> {
  res.json(await service.suggestions());
}
