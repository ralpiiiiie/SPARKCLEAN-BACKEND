import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { listQuerySchema, textIdParamSchema } from "../../utils/params.js";
import { plantCreateSchema, plantUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const plantsRouter = Router();

plantsRouter.get("/", validate({ query: listQuerySchema }), controller.list);
plantsRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
plantsRouter.post("/", validate({ body: plantCreateSchema }), controller.create);
plantsRouter.patch(
  "/:id",
  validate({ params: textIdParamSchema, body: plantUpdateSchema }),
  controller.update,
);
plantsRouter.delete("/:id", validate({ params: textIdParamSchema }), controller.remove);
