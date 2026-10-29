import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  costAssumptionCreateSchema,
  costAssumptionUpdateSchema,
} from "./costAssumptions.validation.js";
import * as controller from "./costAssumptions.controller.js";

export const costAssumptionsRouter = Router();

costAssumptionsRouter.get("/", controller.list);
costAssumptionsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
costAssumptionsRouter.post("/", validate({ body: costAssumptionCreateSchema }), controller.create);
costAssumptionsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: costAssumptionUpdateSchema }),
  controller.update,
);
costAssumptionsRouter.patch("/:id/activate", validate({ params: idParamSchema }), controller.activate);
costAssumptionsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
