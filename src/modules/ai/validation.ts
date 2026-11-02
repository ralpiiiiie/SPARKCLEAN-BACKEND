import { z } from "zod";

/** POST /ai/chat */
export const chatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, "Ask a question with at least 2 characters.")
    .max(1000, "Questions are limited to 1000 characters."),
  conversationId: z.coerce.number().int().positive().optional(),
  pageContext: z
    .enum(["dashboard", "descriptive", "predictive", "prescriptive", "process", "data", "settings", "case-study"])
    .optional(),
});

export type ChatInput = z.infer<typeof chatSchema>;

/** GET/DELETE /ai/conversations/:id */
export const conversationParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});