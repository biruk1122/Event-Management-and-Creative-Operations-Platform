import { createApiClient, type components } from "@event-platform/api-client";

export type BackendLiveness = components["schemas"]["LivenessResponse"];

export async function fetchBackendLiveness(
  apiBaseUrl: string,
  request: typeof fetch = fetch,
): Promise<BackendLiveness> {
  const client = createApiClient({ baseUrl: apiBaseUrl, fetch: request });
  const { data, response } = await client.GET("/health/live", {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok || !data) {
    throw new Error(
      `Backend liveness request failed with status ${response.status}.`,
    );
  }

  return data;
}
