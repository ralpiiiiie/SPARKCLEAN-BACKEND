import type { Request, Response } from "express";
import type { z } from "zod";
import type { settingsUpdateSchema } from "./validation.js";
import * as service from "./service.js";

export async function get(_req: Request, res: Response): Promise<void> {
  res.json(await service.getSettings());
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof settingsUpdateSchema>;
  res.json(await service.updateSettings(body));
}
