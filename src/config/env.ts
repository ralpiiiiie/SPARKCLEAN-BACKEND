import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().optional(),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173,http://localhost:5199,http://localhost:5203"),
  // Auth — JWT secret is mandatory in production; in dev a placeholder works.
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters."),
});

const parsed = envSchema.safeParse({
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "postgres://sparkclean:sparkclean@localhost:5433/sparkclean"),
  JWT_SECRET:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "dev-secret-change-in-production-32"),
});

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  corsOrigins: data.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
