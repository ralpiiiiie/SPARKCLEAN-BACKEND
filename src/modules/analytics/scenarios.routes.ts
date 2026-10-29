import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  approveSchema,
  compareQuerySchema,
  duplicateSchema,
  scenarioCreateSchema,
  scenarioQuerySchema,
  scenarioUpdateSchema,
} from "./scenarios.validation.js";
import * as controller from "./scenarios.controller.js";

export const scenariosRouter = Router();

scenariosRouter.get("/", validate({ query: scenarioQuerySchema }), controller.list);
scenariosRouter.get("/compare", validate({ query: compareQuerySchema }), controller.compare);
scenariosRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
scenariosRouter.post("/", validate({ body: scenarioCreateSchema }), controller.create);
scenariosRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: scenarioUpdateSchema }),
  controller.update,
);
scenariosRouter.post("/:id/solve", validate({ params: idParamSchema }), controller.solve);
scenariosRouter.post(
  "/:id/duplicate",
  validate({ params: idParamSchema, body: duplicateSchema }),
  controller.duplicate,
);
scenariosRouter.post(
  "/:id/approve",
  validate({ params: idParamSchema, body: approveSchema }),
  controller.approve,
);
scenariosRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
