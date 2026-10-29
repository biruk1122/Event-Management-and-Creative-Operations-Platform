import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";
import { z } from "zod";

const monorepoRoot = path.resolve(import.meta.dirname, "../..");
loadEnvConfig(
  monorepoRoot,
  process.env.NODE_ENV === "development",
  undefined,
  true,
);

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
  // Dormant unless NEXT_PUBLIC_API_URL is pointed at this app's own origin
  // (e.g. a dev tunnel) - in the default config the browser calls
  // API_INTERNAL_URL's public counterpart directly and never reaches this
  // server at /api/v1/*, so this rewrite is never hit.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${environment.data.API_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
