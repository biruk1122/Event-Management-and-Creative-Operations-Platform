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
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300_000),
  AUTH_COOKIE_SECURE: booleanFromString.default(false),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  // Starting values from ADR 0004 RT-04; retune with real connection traffic
  // evidence rather than changing the enforcement mechanism.
  REALTIME_COMMAND_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  REALTIME_COMMAND_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  // Storage credentials are server-only. The defaults are deliberately the
  // local MinIO development service; production must supply real values.
  FILE_STORAGE_ENDPOINT: z.url().default("http://localhost:9000"),
  FILE_STORAGE_REGION: z.string().min(1).default("us-east-1"),
  FILE_STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default("event-platform-files"),
  FILE_STORAGE_ACCESS_KEY: z.string().min(3).default("minioadmin"),
  FILE_STORAGE_SECRET_KEY: z.string().min(8).default("minioadmin"),
  FILE_STORAGE_FORCE_PATH_STYLE: booleanFromString.default(true),
  // The development scanner is explicitly not a production fallback. An
  // unavailable scanner rejects finalization safely until an approved
  // production scanner adapter is configured.
  FILE_SCANNER_MODE: z.enum(["test", "unavailable"]).default("test"),
  GOOGLE_MEET_ENABLED: booleanFromString.default(false),
  GOOGLE_MEET_ACTIVATION_REVIEW: z.string().default(""),
  GOOGLE_MEET_OPERATOR: z.string().default(""),
  GOOGLE_MEET_CLIENT_ID: z.string().default(""),
  GOOGLE_MEET_CLIENT_SECRET: z.string().default(""),
  GOOGLE_MEET_CALLBACK_URL: z.string().default(""),
  GOOGLE_MEET_RETURN_URL: z.string().default(""),
  GOOGLE_MEET_KEY_ID: z.string().default(""),
  GOOGLE_MEET_KEYS: z.string().default(""),
  GOOGLE_MEET_USER_MINUTE_CAP: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(10),
  GOOGLE_MEET_USER_DAY_CAP: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100),
  GOOGLE_MEET_PROJECT_MINUTE_CAP: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(60),
  GOOGLE_MEET_PROJECT_DAY_CAP: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(1000),
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
