"use client";

import { createApiClient } from "@event-platform/api-client";

import { clientEnvironment } from "@/env/client";
import { readCsrfToken } from "./csrf";
import { publishSessionEvent } from "./session-events";
import { createSessionTransport } from "./session-transport";

export const browserSession = createSessionTransport({
  baseUrl: clientEnvironment.NEXT_PUBLIC_API_URL,
  csrf: readCsrfToken,
  onEvent: publishSessionEvent,
});

export const browserApi = createApiClient({
  baseUrl: clientEnvironment.NEXT_PUBLIC_API_URL,
  fetch: browserSession.fetch,
});
