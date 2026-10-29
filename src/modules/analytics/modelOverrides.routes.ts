import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  modelOverrideCreateSchema,
  modelOverrideQuerySchema,
  modelOverrideUpdateSchema,
} from "./modelOverrides.validation.js";
import * as controller from "./modelOverrides.controller.js";

export const modelOverridesRouter = Router();

modelOverridesRouter.get("/", validate({ query: modelOverrideQuerySchema }), controller.list);
modelOverridesRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
modelOverridesRouter.post("/", validate({ body: modelOverrideCreateSchema }), controller.create);
modelOverridesRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: modelOverrideUpdateSchema }),
  controller.update,
);
modelOverridesRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
