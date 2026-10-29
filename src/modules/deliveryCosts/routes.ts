import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  deliveryCostCreateSchema,
  deliveryCostQuerySchema,
  deliveryCostUpdateSchema,
} from "./validation.js";
import * as controller from "./controller.js";

export const deliveryCostsRouter = Router();

deliveryCostsRouter.get("/", validate({ query: deliveryCostQuerySchema }), controller.list);
deliveryCostsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
deliveryCostsRouter.post("/", validate({ body: deliveryCostCreateSchema }), controller.create);
deliveryCostsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: deliveryCostUpdateSchema }),
  controller.update,
);
deliveryCostsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
