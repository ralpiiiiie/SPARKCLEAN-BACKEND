import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  procedureRunCreateSchema,
  procedureRunQuerySchema,
  procedureStepCreateSchema,
  procedureStepUpdateSchema,
} from "./procedureRuns.validation.js";
import * as service from "./procedureRuns.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listRuns(req.valid.query as z.infer<typeof procedureRunQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getRun(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createRun(req.valid.body as z.infer<typeof procedureRunCreateSchema>));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateRun(id, req.valid.body as Partial<z.infer<typeof procedureRunCreateSchema>>),
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteRun(id));
}

export async function createStep(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res
    .status(201)
    .json(
      await service.createStep(id, req.valid.body as z.infer<typeof procedureStepCreateSchema>),
    );
}

export async function updateStep(req: Request, res: Response): Promise<void> {
  const { id, stepId } = req.valid.params as { id: number; stepId: number };
  res.json(
    await service.updateStep(id, stepId, req.valid.body as z.infer<typeof procedureStepUpdateSchema>),
  );
}

export async function removeStep(req: Request, res: Response): Promise<void> {
  const { id, stepId } = req.valid.params as { id: number; stepId: number };
  res.json(await service.deleteStep(id, stepId));
}
