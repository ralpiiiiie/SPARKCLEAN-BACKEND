import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { listQuerySchema, textIdParamSchema } from "../../utils/params.js";
import { serviceCreateSchema, serviceUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const servicesRouter = Router();

servicesRouter.get("/", validate({ query: listQuerySchema }), controller.list);
servicesRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
servicesRouter.post(
  "/",
  requireRole("admin", "analyst"),
  validate({ body: serviceCreateSchema }),
  controller.create,
);
servicesRouter.patch(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema, body: serviceUpdateSchema }),
  controller.update,
);
servicesRouter.delete(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema }),
  controller.remove,
);
