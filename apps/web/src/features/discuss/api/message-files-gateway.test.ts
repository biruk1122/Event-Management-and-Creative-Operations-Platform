import { afterEach, describe, expect, it, vi } from "vitest";
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get, POST: post } }));
import {
  uploadMessageFile,
  listMessageFiles,
  messageFileGrant,
} from "./message-files-gateway";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
describe("private message attachments", () => {
  it("uploads through the signed form then finalizes on the existing message", async () => {
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    const available = { id: "file", filename: "notes.txt", state: "available" };
    post
      .mockResolvedValueOnce({
        data: {
          id: "file",
          upload: {
            url: "https://storage.test/upload",
            fields: { key: "opaque" },
          },
        },
      })
      .mockResolvedValueOnce({ data: available });
    const transfer = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", transfer);
    expect(await uploadMessageFile("conversation", "message", file)).toEqual(
      available,
    );
    expect(post.mock.calls[0]?.[1].body).toEqual({
      filename: "notes.txt",
      mediaType: "text/plain",
      sizeBytes: 5,
    });
    expect(transfer).toHaveBeenCalledWith(
      "https://storage.test/upload",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(post.mock.calls[1]?.[0]).toContain(
      "/messages/{messageId}/files/{fileId}/finalize",
    );
    expect(post.mock.calls[1]?.[1].params.path).toEqual({
      conversationId: "conversation",
      messageId: "message",
      fileId: "file",
    });
  });
  it("does not finalize a failed storage transfer", async () => {
    post.mockResolvedValue({
      data: {
        id: "file",
        upload: { url: "https://storage.test/upload", fields: {} },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      uploadMessageFile(
        "conversation",
        "message",
        new File(["notes"], "notes.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("upload failed");
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("lists and downloads only through conversation-and-message-scoped API routes", async () => {
    get
      .mockResolvedValueOnce({ data: { items: [{ id: "file" }] } })
      .mockResolvedValueOnce({
        data: { url: "https://storage.test/private-download" },
      });
    expect(await listMessageFiles("conversation", "message")).toEqual([
      { id: "file" },
    ]);
    expect(
      await messageFileGrant("conversation", "message", "file"),
    ).toMatchObject({ url: "https://storage.test/private-download" });
    expect(get.mock.calls[1]?.[1]).toMatchObject({
      params: {
        path: {
          conversationId: "conversation",
          messageId: "message",
          fileId: "file",
        },
      },
      cache: "no-store",
    });
  });
});
