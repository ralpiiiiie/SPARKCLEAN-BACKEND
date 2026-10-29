import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import { demandCreateSchema, demandQuerySchema, demandUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const demandRouter = Router();

demandRouter.get("/", validate({ query: demandQuerySchema }), controller.list);
demandRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
demandRouter.post("/", validate({ body: demandCreateSchema }), controller.create);
demandRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: demandUpdateSchema }),
  controller.update,
);
demandRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
