import { z } from "zod";

/** POST /auth/login */
export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

/** GET /auth/me */
export const meSchema = z.object({});

/** POST /auth/users (admin only) */
export const createUserSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters."),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(6, "Password must be at least 6 characters."),
    role: z.enum(["admin", "analyst", "manager"]).default("analyst"),
    branchId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "manager" && !value.branchId) {
      ctx.addIssue({
        code: "custom",
        path: ["branchId"],
        message: "Assign a branch to every branch manager account.",
      });
    }
    if (value.role !== "manager" && value.branchId) {
      ctx.addIssue({
        code: "custom",
        path: ["branchId"],
        message: "Only branch manager accounts can be assigned to a single branch.",
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
