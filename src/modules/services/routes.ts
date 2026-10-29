import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { listQuerySchema, textIdParamSchema } from "../../utils/params.js";
import { serviceCreateSchema, serviceUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const servicesRouter = Router();

servicesRouter.get("/", validate({ query: listQuerySchema }), controller.list);
servicesRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
servicesRouter.post("/", validate({ body: serviceCreateSchema }), controller.create);
servicesRouter.patch(
  "/:id",
  validate({ params: textIdParamSchema, body: serviceUpdateSchema }),
  controller.update,
);
servicesRouter.delete("/:id", validate({ params: textIdParamSchema }), controller.remove);
