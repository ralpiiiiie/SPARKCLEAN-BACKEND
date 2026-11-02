import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import { chatSchema, conversationParamSchema } from "./validation.js";
import * as controller from "./controller.js";

export const aiRouter = Router();

/**
 * Stricter, per-account limit on top of the global IP limit.
 * Keyed on the authenticated user (admin or manager) so one account cannot
 * exhaust another's quota.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.AI_RATE_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id ?? "anon"}`,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: `Too many assistant requests. Try again later (${env.AI_RATE_LIMIT_PER_HOUR}/hour).`,
    },
  },
});

// Authentication and branch authorization are applied globally in app.ts
// before this router, so every handler below runs with a trusted req.user.
aiRouter.post("/chat", aiLimiter, validate({ body: chatSchema }), controller.chat);
aiRouter.get("/conversations", controller.conversations);
aiRouter.get(
  "/conversations/:id",
  validate({ params: conversationParamSchema }),
  controller.conversation,
);
aiRouter.delete(
  "/conversations/:id",
  validate({ params: conversationParamSchema }),
  controller.removeConversation,
);