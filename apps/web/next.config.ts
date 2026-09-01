import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";
import { z } from "zod";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");
loadEnvConfig(monorepoRoot);

const environmentSchema = z.object({
  API_INTERNAL_URL: z.url(),
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_WS_URL: z.url(),
});

const environment = environmentSchema.safeParse(process.env);

if (!environment.success) {
  throw new Error(
    `Invalid frontend environment configuration: ${z.prettifyError(environment.error)}`,
  );
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@event-platform/api-client", "@event-platform/shared"],
  typedRoutes: true,
};

export default nextConfig;
