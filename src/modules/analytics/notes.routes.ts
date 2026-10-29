import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../utils/params.js";
import { noteCreateSchema, noteQuerySchema, noteUpdateSchema } from "./notes.validation.js";
import * as controller from "./notes.controller.js";

export const notesRouter = Router();

notesRouter.get("/", validate({ query: noteQuerySchema }), controller.list);
notesRouter.get("/:id", validate({ params: idParamSchema }), controller.get);
notesRouter.post("/", validate({ body: noteCreateSchema }), controller.create);
notesRouter.patch(
  "/:id",
  validate({ params: idParamSchema, body: noteUpdateSchema }),
  controller.update,
);
notesRouter.delete("/:id", validate({ params: idParamSchema }), controller.remove);
