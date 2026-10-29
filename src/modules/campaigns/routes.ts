import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { textIdParamSchema } from "../../utils/params.js";
import { campaignCreateSchema, campaignQuerySchema, campaignUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const campaignsRouter = Router();

campaignsRouter.get("/", validate({ query: campaignQuerySchema }), controller.list);
campaignsRouter.get("/:id", validate({ params: textIdParamSchema }), controller.get);
campaignsRouter.post("/", validate({ body: campaignCreateSchema }), controller.create);
campaignsRouter.patch(
  "/:id",
  validate({ params: textIdParamSchema, body: campaignUpdateSchema }),
  controller.update,
);
campaignsRouter.delete("/:id", validate({ params: textIdParamSchema }), controller.remove);
