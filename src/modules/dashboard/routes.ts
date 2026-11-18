import { Router, type Request, type Response } from "express";
import { dashboard } from "./service.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req: Request, res: Response) => {
  res.json(await dashboard());
});
