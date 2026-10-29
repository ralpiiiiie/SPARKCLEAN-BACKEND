import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { settingsUpdateSchema } from "./validation.js";
import * as controller from "./controller.js";

export const settingsRouter = Router();

settingsRouter.get("/", controller.get);
settingsRouter.put("/", validate({ body: settingsUpdateSchema }), controller.update);
