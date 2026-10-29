import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  forecastRunCreateSchema,
  forecastRunQuerySchema,
  forecastRunUpdateSchema,
} from "./forecastRuns.validation.js";
import * as controller from "./forecastRuns.controller.js";

export const forecastRunsRouter = Router();

forecastRunsRouter.get("/", validate({ query: forecastRunQuerySchema }), controller.list);
forecastRunsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
forecastRunsRouter.post("/", validate({ body: forecastRunCreateSchema }), controller.create);
forecastRunsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: forecastRunUpdateSchema }),
  controller.update,
);
forecastRunsRouter.post("/:id/rerun", validate({ params: idParamSchema }), controller.rerun);
forecastRunsRouter.post("/:id/duplicate", validate({ params: idParamSchema }), controller.duplicate);
forecastRunsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
