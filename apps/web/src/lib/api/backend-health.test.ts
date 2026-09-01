import { describe, expect, it, vi } from "vitest";

import { fetchBackendLiveness } from "./backend-health";

describe("backend health client", () => {
  it("requests the unversioned API liveness endpoint", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "ok",
        timestamp: "2026-09-01T09:00:00.000Z",
      }),
    );

    await expect(
      fetchBackendLiveness("http://api:4000/api/v1", request),
    ).resolves.toEqual({
      status: "ok",
      timestamp: "2026-09-01T09:00:00.000Z",
    });
    expect(request).toHaveBeenCalledWith("http://api:4000/health/live", {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects unsuccessful or malformed API responses", async () => {
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "unknown" }));

    await expect(
      fetchBackendLiveness("http://api:4000/api/v1", unavailable),
    ).rejects.toThrow("Backend liveness request failed with status 503.");
    await expect(
      fetchBackendLiveness("http://api:4000/api/v1", malformed),
    ).rejects.toThrow();
  });
});
