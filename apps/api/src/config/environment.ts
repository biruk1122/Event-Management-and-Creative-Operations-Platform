import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  loadDotenv({ path, quiet: true });
}

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  API_RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      "DATABASE_URL must use the postgres or postgresql protocol.",
    ),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_REFRESH_TOKEN_SECRET: z.string().min(32),
  AUTH_ACCESS_TOKEN_TTL: z.string().min(1).default("15m"),
  AUTH_REFRESH_TOKEN_TTL: z.string().min(1).default("30d"),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(10),
  AUTH_LOCKOUT_DURATION_MS: z.coerce.number().int().positive().default(900_000),
  AUTH_COOKIE_SECURE: booleanFromString.default(false),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
});

export type Environment = z.infer<typeof environmentSchema>;

export const ENVIRONMENT = Symbol("ENVIRONMENT");

export function validateEnvironment(
  configuration: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(configuration);

  if (!result.success) {
    throw new Error(
      `Environment validation failed: ${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const environment = validateEnvironment(process.env);
