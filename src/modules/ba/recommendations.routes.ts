import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  recommendationCreateSchema,
  recommendationQuerySchema,
  recommendationUpdateSchema,
} from "./recommendations.validation.js";
import * as controller from "./recommendations.controller.js";

export const recommendationsRouter = Router();

recommendationsRouter.get("/suggestions", controller.suggested);
recommendationsRouter.get("/", validate({ query: recommendationQuerySchema }), controller.list);
recommendationsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
recommendationsRouter.post(
  "/",
  validate({ body: recommendationCreateSchema }),
  controller.create,
);
recommendationsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: recommendationUpdateSchema }),
  controller.update,
);
recommendationsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
