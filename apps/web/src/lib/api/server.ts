import "server-only";

import { createApiClient } from "@event-platform/api-client";

import { serverEnvironment } from "@/env/server";

export function createServerApi(headers?: HeadersInit) {
  return createApiClient({
    baseUrl: serverEnvironment.API_INTERNAL_URL,
    getHeaders: () => headers ?? {},
  });
}
