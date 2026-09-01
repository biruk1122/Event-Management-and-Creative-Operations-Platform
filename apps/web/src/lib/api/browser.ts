"use client";

import { createApiClient } from "@event-platform/api-client";

import { clientEnvironment } from "@/env/client";

export const browserApi = createApiClient({
  baseUrl: clientEnvironment.NEXT_PUBLIC_API_URL,
});
