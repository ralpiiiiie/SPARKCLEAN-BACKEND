import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  scheduleItemQuerySchema,
  scheduleItemUpdateSchema,
} from "./scheduleItems.validation.js";
import * as controller from "./scheduleItems.controller.js";

export const scheduleItemsRouter = Router();

scheduleItemsRouter.get("/", validate({ query: scheduleItemQuerySchema }), controller.list);
scheduleItemsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
scheduleItemsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: scheduleItemUpdateSchema }),
  controller.update,
);
