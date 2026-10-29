import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  procedureRunCreateSchema,
  procedureRunQuerySchema,
  procedureRunUpdateSchema,
  procedureStepCreateSchema,
  procedureStepUpdateSchema,
} from "./procedureRuns.validation.js";
import * as controller from "./procedureRuns.controller.js";

export const procedureRunsRouter = Router();

const stepParams = z.object({
  id: z.coerce.number().int().positive(),
  stepId: z.coerce.number().int().positive(),
});

procedureRunsRouter.get("/", validate({ query: procedureRunQuerySchema }), controller.list);
procedureRunsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
procedureRunsRouter.post("/", validate({ body: procedureRunCreateSchema }), controller.create);
procedureRunsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: procedureRunUpdateSchema }),
  controller.update,
);
procedureRunsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);

procedureRunsRouter.post(
  "/:id/steps",
  validate({ params: idParamSchema, body: procedureStepCreateSchema }),
  controller.createStep,
);
procedureRunsRouter.patch(
  "/:id/steps/:stepId",
  validate({ params: stepParams, body: procedureStepUpdateSchema }),
  controller.updateStep,
);
procedureRunsRouter.delete(
  "/:id/steps/:stepId",
  validate({ params: stepParams }),
  controller.removeStep,
);
