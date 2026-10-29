import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  savedViewCreateSchema,
  savedViewQuerySchema,
  savedViewUpdateSchema,
} from "./savedViews.validation.js";
import * as controller from "./savedViews.controller.js";

export const savedViewsRouter = Router();

savedViewsRouter.get("/", validate({ query: savedViewQuerySchema }), controller.list);
savedViewsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
savedViewsRouter.post("/", validate({ body: savedViewCreateSchema }), controller.create);
savedViewsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: savedViewUpdateSchema }),
  controller.update,
);
savedViewsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
