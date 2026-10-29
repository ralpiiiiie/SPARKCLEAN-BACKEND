import type { Request, Response } from "express";
import type { z } from "zod";
import type { noteCreateSchema, noteQuerySchema } from "./notes.validation.js";
import * as service from "./notes.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listNotes(req.valid.query as z.infer<typeof noteQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getNote(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.createNote(req.valid.body as z.infer<typeof noteCreateSchema>));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateNote(id, req.valid.body as Partial<z.infer<typeof noteCreateSchema>>),
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.deleteNote(id));
}
