import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import { textIdParamSchema } from "../../utils/params.js";
import { orderCreateSchema, orderQuerySchema, orderUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const ordersRouter = Router();

ordersRouter.get("/", validate({ query: orderQuerySchema }), controller.list);
ordersRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
ordersRouter.post(
  "/",
  requireRole("admin", "analyst"),
  validate({ body: orderCreateSchema }),
  controller.create,
);
ordersRouter.patch(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema, body: orderUpdateSchema }),
  controller.update,
);
ordersRouter.delete(
  "/:id",
  requireRole("admin", "analyst"),
  validate({ params: textIdParamSchema }),
  controller.remove,
);
