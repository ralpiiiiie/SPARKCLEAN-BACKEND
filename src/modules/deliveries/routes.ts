import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { textIdParamSchema } from "../../utils/params.js";
import { deliveryCreateSchema, deliveryQuerySchema, deliveryUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const deliveriesRouter = Router();

deliveriesRouter.get("/", validate({ query: deliveryQuerySchema }), controller.list);
deliveriesRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
deliveriesRouter.post("/", validate({ body: deliveryCreateSchema }), controller.create);
deliveriesRouter.patch(
  "/:id",
  validate({ params: textIdParamSchema, body: deliveryUpdateSchema }),
  controller.update,
);
deliveriesRouter.delete("/:id", validate({ params: textIdParamSchema }), controller.remove);
