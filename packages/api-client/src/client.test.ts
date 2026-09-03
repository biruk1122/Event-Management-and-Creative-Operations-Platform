import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client";

describe("generated API client", () => {
  it("uses generated paths from an API base URL and preserves request options", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "ok",
        timestamp: "2026-09-01T09:00:00.000Z",
      }),
    );
    const client = createApiClient({
      baseUrl: "http://api:4000/api/v1/",
      fetch: request,
      getHeaders: () => ({ "x-request-id": "configured" }),
    });

    const result = await client.GET("/health/live", {
      headers: { "x-request-id": "request" },
    });

    expect(result.data).toEqual({
      status: "ok",
      timestamp: "2026-09-01T09:00:00.000Z",
    });
    expect(request).toHaveBeenCalledOnce();

    const sentRequest = request.mock.calls[0]?.[0];
    expect(sentRequest).toBeInstanceOf(Request);
    expect((sentRequest as Request).url).toBe("http://api:4000/health/live");
    expect((sentRequest as Request).credentials).toBe("include");
    expect((sentRequest as Request).headers.get("accept")).toBe(
      "application/json",
    );
    expect((sentRequest as Request).headers.get("x-request-id")).toBe(
      "request",
    );
  });
});
