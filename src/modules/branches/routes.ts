import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { listQuerySchema, textIdParamSchema } from "../../utils/params.js";
import { branchCreateSchema, branchUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const branchesRouter = Router();

branchesRouter.get("/", validate({ query: listQuerySchema }), controller.list);
branchesRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
branchesRouter.post(
  "/",
  requireRole("admin", "analyst"),
  validate({ body: branchCreateSchema }),
  controller.create,
);
branchesRouter.patch(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema, body: branchUpdateSchema }),
  controller.update,
);
branchesRouter.delete(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema }),
  controller.remove,
);
