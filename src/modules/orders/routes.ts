import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { textIdParamSchema } from "../../utils/params.js";
import { orderCreateSchema, orderQuerySchema, orderUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const ordersRouter = Router();

ordersRouter.get("/", validate({ query: orderQuerySchema }), controller.list);
ordersRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
ordersRouter.post("/", validate({ body: orderCreateSchema }), controller.create);
ordersRouter.patch(
  "/:id",
  validate({ params: textIdParamSchema, body: orderUpdateSchema }),
  controller.update,
);
ordersRouter.delete("/:id", validate({ params: textIdParamSchema }), controller.remove);
