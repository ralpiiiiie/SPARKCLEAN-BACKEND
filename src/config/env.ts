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
  // AI provider (OpenAI-compatible). Base URL defaults to OpenAI; override for Azure/other.
  AI_PROVIDER_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(50),
});

const parsed = envSchema.safeParse({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || (process.env.NODE_ENV === "production" ? undefined : "postgres://sparkclean:sparkclean@localhost:5433/sparkclean"),
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-in-production-32"),
});

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

// Production hardening: AI provider key is mandatory in production.
if (data.NODE_ENV === "production" && !data.AI_PROVIDER_API_KEY) {
  console.error("Invalid environment configuration: AI_PROVIDER_API_KEY is required in production.");
  process.exit(1);
}

export const env = {
  ...data,
  corsOrigins: data.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
