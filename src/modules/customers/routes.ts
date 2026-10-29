import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { textIdParamSchema } from "../../utils/params.js";
import { customerCreateSchema, customerQuerySchema, customerUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const customersRouter = Router();

customersRouter.get("/", validate({ query: customerQuerySchema }), controller.list);
customersRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
customersRouter.post("/", validate({ body: customerCreateSchema }), controller.create);
customersRouter.patch(
  "/:id",
  validate({ params: textIdParamSchema, body: customerUpdateSchema }),
  controller.update,
);
customersRouter.delete("/:id", validate({ params: textIdParamSchema }), controller.remove);
