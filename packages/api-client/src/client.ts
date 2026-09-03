import createOpenApiClient, { type Client } from "openapi-fetch";

import type { paths } from "./generated/schema";

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
}

export type ApiClient = Client<paths>;

function normalizeApiOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "");
  return url.toString().replace(/\/$/, "");
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const request = options.fetch ?? globalThis.fetch;

  return createOpenApiClient<paths>({
    baseUrl: normalizeApiOrigin(options.baseUrl),
    credentials: "include",
    fetch: async (input) => {
      const headers = new Headers(await options.getHeaders?.());
      input.headers.forEach((value, key) => headers.set(key, value));

      if (!headers.has("accept")) {
        headers.set("accept", "application/json");
      }

      return request(new Request(input, { headers }));
    },
  });
}
