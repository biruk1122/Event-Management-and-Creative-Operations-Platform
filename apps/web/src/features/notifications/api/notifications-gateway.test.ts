import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listNotifications,
  listPreferences,
  markRead,
  setPreference,
  unreadCount,
  NotificationsRequestError,
} from "./notifications-gateway";

const { get, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, PUT: put, DELETE: del },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number) => ({
  error: { code, status },
  response: { ok: false, status },
});

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("notifications gateway reads", () => {
  it("defaults the limit and omits an absent cursor", async () => {
    get.mockResolvedValue(ok({ items: [], nextCursor: null }));
    await listNotifications({});
    expect(get).toHaveBeenCalledWith(
      "/api/v1/notifications",
      expect.objectContaining({
        params: { query: { limit: 25 } },
        cache: "no-store",
      }),
    );
  });

  it("sends the cursor when given one", async () => {
    get.mockResolvedValue(ok({ items: [], nextCursor: null }));
    await listNotifications({ cursor: "opaque-cursor" });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/notifications",
      expect.objectContaining({
        params: { query: { limit: 25, cursor: "opaque-cursor" } },
      }),
    );
  });

  it("throws a NotificationsRequestError when the feed request fails", async () => {
    get.mockResolvedValue(fail("AUTH_UNAUTHENTICATED", 401));
    await expect(listNotifications({})).rejects.toBeInstanceOf(
      NotificationsRequestError,
    );
  });

  it("reads the unread count", async () => {
    get.mockResolvedValue(ok({ unreadCount: 3 }));
    await expect(unreadCount()).resolves.toBe(3);
  });

  it("reads the preference list", async () => {
    const items = [{ type: "NEW_MESSAGE", muted: true }];
    get.mockResolvedValue(ok({ items }));
    await expect(listPreferences()).resolves.toEqual(items);
  });
});

describe("markRead", () => {
  it("sends the CSRF header and returns the updated notification on success", async () => {
    document.cookie = "csrf_token=csrf-value; path=/";
    const notification = { id: "n-1", readAt: "2026-01-01T00:00:00.000Z" };
    put.mockResolvedValue(ok(notification));

    await expect(markRead("n-1")).resolves.toEqual({
      status: "success",
      notification,
    });
    expect(put).toHaveBeenCalledWith(
      "/api/v1/notifications/{id}/read",
      expect.objectContaining({
        params: { path: { id: "n-1" } },
        headers: { "x-csrf-token": "csrf-value" },
      }),
    );
  });

  it("maps NOTIFICATION_NOT_FOUND to not_found", async () => {
    put.mockResolvedValue(fail("NOTIFICATION_NOT_FOUND", 404));
    await expect(markRead("missing")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("maps a permission-denied code to permission_denied", async () => {
    put.mockResolvedValue(fail("PERMISSION_DENIED", 403));
    await expect(markRead("n-1")).resolves.toEqual({
      status: "permission_denied",
    });
  });

  it("maps a thrown error to unexpected", async () => {
    put.mockRejectedValue(new Error("network down"));
    await expect(markRead("n-1")).resolves.toEqual({ status: "unexpected" });
  });
});

describe("setPreference", () => {
  it("PUTs to mute a type", async () => {
    put.mockResolvedValue({ response: { ok: true, status: 200 } });
    await expect(setPreference("NEW_MESSAGE", true)).resolves.toEqual({
      status: "success",
    });
    expect(put).toHaveBeenCalledWith(
      "/api/v1/notifications/preferences/{type}",
      expect.objectContaining({ params: { path: { type: "NEW_MESSAGE" } } }),
    );
  });

  it("DELETEs to unmute a type", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 200 } });
    await expect(setPreference("NEW_MESSAGE", false)).resolves.toEqual({
      status: "success",
    });
    expect(del).toHaveBeenCalledWith(
      "/api/v1/notifications/preferences/{type}",
      expect.objectContaining({ params: { path: { type: "NEW_MESSAGE" } } }),
    );
  });

  it("maps NOTIFICATION_TYPE_NOT_MUTABLE to type_not_mutable", async () => {
    put.mockResolvedValue(fail("NOTIFICATION_TYPE_NOT_MUTABLE", 400));
    await expect(setPreference("TASK_ASSIGNED", true)).resolves.toEqual({
      status: "type_not_mutable",
    });
  });

  it("maps NOTIFICATION_TYPE_INVALID to type_invalid", async () => {
    put.mockResolvedValue(fail("NOTIFICATION_TYPE_INVALID", 400));
    await expect(setPreference("NOT_A_TYPE", true)).resolves.toEqual({
      status: "type_invalid",
    });
  });
});
