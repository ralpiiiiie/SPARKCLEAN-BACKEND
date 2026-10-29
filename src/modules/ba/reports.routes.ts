import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import {
  reportCreateSchema,
  reportQuerySchema,
  reportUpdateSchema,
  snapshotCreateSchema,
} from "./reports.validation.js";
import * as controller from "./reports.controller.js";

export const reportsRouter = Router();

reportsRouter.get("/", validate({ query: reportQuerySchema }), controller.list);
reportsRouter.post("/snapshot", validate({ body: snapshotCreateSchema }), controller.snapshot);
reportsRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
reportsRouter.post("/", validate({ body: reportCreateSchema }), controller.create);
reportsRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: reportUpdateSchema }),
  controller.update,
);
reportsRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
