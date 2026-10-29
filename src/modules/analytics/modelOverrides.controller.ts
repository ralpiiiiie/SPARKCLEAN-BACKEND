import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  modelOverrideCreateSchema,
  modelOverrideQuerySchema,
} from "./modelOverrides.validation.js";
import * as service from "./modelOverrides.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(
    await service.listOverrides(req.valid.query as z.infer<typeof modelOverrideQuerySchema>),
  );
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getOverride(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await service.upsertOverride(
        req.valid.body as z.infer<typeof modelOverrideCreateSchema>,
      ),
    );
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateOverride(
      id,
      req.valid.body as Partial<z.infer<typeof modelOverrideCreateSchema>>,
    ),
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteOverride(id));
}
