import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { loginSchema, meSchema, createUserSchema } from "./validation.js";
import * as controller from "./controller.js";

export const authRouter = Router();

authRouter.post("/login", validate({ body: loginSchema }), controller.login);
authRouter.get("/me", requireAuth, validate({ query: meSchema }), controller.me);

// Admin-only user management.
authRouter.get("/users", requireAuth, requireRole("admin"), controller.list);
authRouter.post("/users", requireAuth, requireRole("admin"), validate({ body: createUserSchema }), controller.create);