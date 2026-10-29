import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { dashboardQuerySchema } from "./validation.js";
import * as controller from "./controller.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", validate({ query: dashboardQuerySchema }), controller.summary);
