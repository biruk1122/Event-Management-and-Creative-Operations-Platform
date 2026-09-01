import { z } from "zod";

const backendLivenessSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export type BackendLiveness = z.infer<typeof backendLivenessSchema>;

export async function fetchBackendLiveness(
  apiBaseUrl: string,
  request: typeof fetch = fetch,
): Promise<BackendLiveness> {
  const livenessUrl = new URL("/health/live", apiBaseUrl);
  const response = await request(livenessUrl.toString(), {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(
      `Backend liveness request failed with status ${response.status}.`,
    );
  }

  return backendLivenessSchema.parse(await response.json());
}
