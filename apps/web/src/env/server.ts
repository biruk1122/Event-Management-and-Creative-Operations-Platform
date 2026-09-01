import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  API_INTERNAL_URL: z.url(),
});

export const serverEnvironment = serverEnvironmentSchema.parse({
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
});
