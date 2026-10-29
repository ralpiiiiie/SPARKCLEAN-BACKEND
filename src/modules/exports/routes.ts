import { Router } from "express";
import type { Request, Response } from "express";
import * as service from "./service.js";

async function send(entity: string, res: Response): Promise<void> {
  const { filename, csv } = await service.exportCsv(entity);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export const exportsRouter = Router();

const entityOf = (value: string | string[]): string =>
  Array.isArray(value) ? (value[0] ?? "") : value;

exportsRouter.get("/:entity.csv", async (req: Request, res: Response) => {
  await send(entityOf(req.params.entity), res);
});
exportsRouter.get("/:entity", async (req: Request, res: Response) => {
  await send(entityOf(req.params.entity), res);
});
