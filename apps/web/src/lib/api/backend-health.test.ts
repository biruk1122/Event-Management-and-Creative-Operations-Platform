import { describe, expect, it, vi } from "vitest";

import { fetchBackendLiveness } from "./backend-health";

describe("backend health client", () => {
  it("requests the unversioned liveness endpoint through the generated client", async () => {
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

    const sentRequest = request.mock.calls[0]?.[0];
    expect(sentRequest).toBeInstanceOf(Request);
    expect((sentRequest as Request).url).toBe("http://api:4000/health/live");
    expect((sentRequest as Request).cache).toBe("no-store");
    expect((sentRequest as Request).headers.get("accept")).toBe(
      "application/json",
    );
  });

  it("rejects an unsuccessful API response", async () => {
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      fetchBackendLiveness("http://api:4000/api/v1", unavailable),
    ).rejects.toThrow("Backend liveness request failed with status 503.");
  });
});
