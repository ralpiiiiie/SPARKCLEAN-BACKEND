import { Router, type Request, type Response } from "express";
import type { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { settingsUpdateSchema } from "./validation.js";
import * as service from "./service.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req: Request, res: Response) => {
  res.json({ data: await service.getSettings() });
});

settingsRouter.put(
  "/",
  requireRole("admin", "analyst"),
  validate({ body: settingsUpdateSchema }),
  async (req: Request, res: Response) => {
    const input = req.valid.body as z.infer<typeof settingsUpdateSchema>;
    res.json({ data: await service.updateSettings(input) });
  },
);
