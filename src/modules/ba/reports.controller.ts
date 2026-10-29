import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  reportCreateSchema,
  reportQuerySchema,
  reportUpdateSchema,
  snapshotCreateSchema,
} from "./reports.validation.js";
import * as service from "./reports.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listReports(req.valid.query as z.infer<typeof reportQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getReport(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createReport(req.valid.body as z.infer<typeof reportCreateSchema>));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  const body = req.valid.body as z.infer<typeof reportUpdateSchema>;
  res.json(await service.updateReport(id, body.title ?? ""));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteReport(id));
}

export async function snapshot(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createSnapshot(req.valid.body as z.infer<typeof snapshotCreateSchema>));
}
