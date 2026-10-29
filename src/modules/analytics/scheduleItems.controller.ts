import type { Request, Response } from "express";
import type { z } from "zod";
import type {
  scheduleItemQuerySchema,
  scheduleItemUpdateSchema,
} from "./scheduleItems.validation.js";
import * as service from "./scheduleItems.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listScheduleItems(req.valid.query as z.infer<typeof scheduleItemQuerySchema>));
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(await service.getScheduleItem(id));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as { id: number };
  res.json(
    await service.updateScheduleItem(
      id,
      req.valid.body as z.infer<typeof scheduleItemUpdateSchema>,
    ),
  );
}
