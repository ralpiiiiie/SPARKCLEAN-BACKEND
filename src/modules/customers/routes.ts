import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { textIdParamSchema } from "../../utils/params.js";
import { customerCreateSchema, customerQuerySchema, customerUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const customersRouter = Router();

customersRouter.get("/", validate({ query: customerQuerySchema }), controller.list);
customersRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
customersRouter.post(
  "/",
  requireRole("admin", "analyst"),
  validate({ body: customerCreateSchema }),
  controller.create,
);
customersRouter.patch(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema, body: customerUpdateSchema }),
  controller.update,
);
customersRouter.delete(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema }),
  controller.remove,
);
