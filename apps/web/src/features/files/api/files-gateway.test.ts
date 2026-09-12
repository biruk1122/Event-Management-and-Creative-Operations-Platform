import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  DELETE: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({ browserApi: api }));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf" }));

import {
  FilesRequestError,
  listEventFiles,
  uploadEventFile,
} from "./files-gateway";

describe("files gateway", () => {
  it("lists an event's files through the generated client", async () => {
    api.GET.mockResolvedValue({
      data: { items: [], page: 1, pageSize: 20, total: 0 },
      response: { status: 200 },
    });
    await expect(listEventFiles("event-1")).resolves.toMatchObject({
      total: 0,
    });
    expect(api.GET).toHaveBeenCalledWith(
      "/api/v1/events/{eventId}/files",
      expect.objectContaining({
        params: expect.objectContaining({ path: { eventId: "event-1" } }),
      }),
    );
  });

  it("keeps an upload retryable when the API rejects its intent", async () => {
    api.POST.mockResolvedValue({
      data: undefined,
      error: { code: "FILE_NOT_FOUND", status: 404, detail: "Event missing" },
      response: { status: 404 },
    });
    await expect(
      uploadEventFile(
        "event-1",
        new File(["pdf"], "notes.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toBeInstanceOf(FilesRequestError);
  });

  it("uploads the signed form and finalizes only after storage accepts it", async () => {
    api.POST.mockResolvedValueOnce({
      data: {
        id: "file-1",
        upload: {
          url: "https://storage.test/upload",
          fields: { key: "files/opaque", policy: "policy" },
        },
        filename: "notes.pdf",
        mediaType: "application/pdf",
        sizeBytes: 3,
      },
      response: { status: 201 },
    }).mockResolvedValueOnce({
      data: {
        id: "file-1",
        filename: "notes.pdf",
        mediaType: "application/pdf",
        sizeBytes: 3,
        state: "available",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      response: { status: 200 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 204 })),
    );
    await expect(
      uploadEventFile(
        "event-1",
        new File(["pdf"], "notes.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toMatchObject({ id: "file-1" });
    expect(fetch).toHaveBeenCalledWith(
      "https://storage.test/upload",
      expect.objectContaining({ method: "POST" }),
    );
    expect(api.POST).toHaveBeenLastCalledWith(
      "/api/v1/events/{eventId}/files/{fileId}/finalize",
      expect.objectContaining({
        params: { path: { eventId: "event-1", fileId: "file-1" } },
      }),
    );
  });
});
