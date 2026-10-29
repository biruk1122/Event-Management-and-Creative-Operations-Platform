import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { NotificationItem } from "../lib/notifications-types";
import {
  notificationsKeys,
  useNotificationsMutations,
} from "./notifications-queries";
import * as gateway from "./notifications-gateway";

vi.mock("./notifications-gateway", () => ({
  markRead: vi.fn(),
  removeNotification: vi.fn(),
  setPreference: vi.fn(),
  listNotifications: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
const access: CurrentAccess = {
  userId: "viewer-1",
  grants: [{ permissionKey: "notification.read", scope: "SELF" }],
};
const item: NotificationItem = {
  id: "notification-1",
  type: "NEW_MESSAGE",
  title: "New message",
  body: "Hello",
  createdAt: "2026-10-19T09:00:00Z",
  readAt: null,
  messageId: "message-1",
  taskId: null,
  eventId: null,
  meetingId: null,
  expenseId: null,
  reportId: null,
  partnerId: null,
  letterId: null,
  documentId: null,
};
function setup() {
  const client = new QueryClient();
  const keys = notificationsKeys(access);
  client.setQueryData(keys.feed, {
    pages: [{ items: [item], nextCursor: null }],
    pageParams: [null],
  });
  client.setQueryData(keys.unreadCount, 2);
  const hook = renderHook(() => useNotificationsMutations(access), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, keys, ...hook };
}
describe("notification read reconciliation", () => {
  it("removes the cached entry and decrements unread count only once", async () => {
    vi.mocked(gateway.removeNotification).mockResolvedValue(undefined);
    const { result, client, keys } = setup();
    await act(async () => {
      await result.current.remove.mutateAsync(item.id);
    });
    expect(client.getQueryData(keys.feed)).toMatchObject({
      pages: [{ items: [] }],
    });
    expect(client.getQueryData(keys.unreadCount)).toBe(1);
    await act(async () => {
      await result.current.remove.mutateAsync(item.id);
    });
    expect(client.getQueryData(keys.unreadCount)).toBe(1);
  });
  it("keeps the entry and count when removal fails", async () => {
    vi.mocked(gateway.removeNotification).mockRejectedValue(
      new Error("Offline"),
    );
    const { result, client, keys } = setup();
    await act(async () => {
      await expect(result.current.remove.mutateAsync(item.id)).rejects.toThrow(
        "Offline",
      );
    });
    expect(client.getQueryData(keys.feed)).toMatchObject({
      pages: [{ items: [item] }],
    });
    expect(client.getQueryData(keys.unreadCount)).toBe(2);
  });
  it("decreases the shared badge count and updates the feed after a successful click", async () => {
    vi.mocked(gateway.markRead).mockResolvedValue({
      status: "success",
      notification: { ...item, readAt: "2026-10-19T09:01:00Z" },
    });
    const { result, client, keys } = setup();
    await act(async () => {
      await result.current.markRead.mutateAsync(item.id);
    });
    expect(client.getQueryData(keys.unreadCount)).toBe(1);
    expect(client.getQueryData(keys.feed)).toMatchObject({
      pages: [{ items: [{ readAt: "2026-10-19T09:01:00Z" }] }],
    });
    expect(client.getQueryState(keys.unreadCount)?.isInvalidated).toBe(true);
  });
  it("does not decrease twice when the same notification is clicked again", async () => {
    vi.mocked(gateway.markRead).mockResolvedValue({
      status: "success",
      notification: { ...item, readAt: "2026-10-19T09:01:00Z" },
    });
    const { result, client, keys } = setup();
    await act(async () => {
      await Promise.all([
        result.current.markRead.mutateAsync(item.id),
        result.current.markRead.mutateAsync(item.id),
      ]);
    });
    expect(client.getQueryData(keys.unreadCount)).toBe(1);
  });
  it("keeps the badge and unread state when saving fails", async () => {
    vi.mocked(gateway.markRead).mockResolvedValue({
      status: "permission_denied",
    });
    const { result, client, keys } = setup();
    await act(async () => {
      await result.current.markRead.mutateAsync(item.id);
    });
    expect(client.getQueryData(keys.unreadCount)).toBe(2);
    expect(client.getQueryData(keys.feed)).toMatchObject({
      pages: [{ items: [{ readAt: null }] }],
    });
  });
  it("marks unread notifications across every page and reconciles the count", async () => {
    vi.mocked(gateway.listNotifications)
      .mockResolvedValueOnce({
        items: [
          item,
          { ...item, id: "already-read", readAt: "2026-10-19T09:01:00Z" },
        ],
        nextCursor: "older-page",
      })
      .mockResolvedValueOnce({
        items: [{ ...item, id: "older-notice" }],
        nextCursor: null,
      });
    vi.mocked(gateway.markRead).mockResolvedValue({
      status: "success",
      notification: { ...item, readAt: "2026-10-19T09:01:00Z" },
    });
    const { result, client, keys } = setup();
    await act(async () => {
      await result.current.markAllRead.mutateAsync();
    });
    expect(gateway.markRead).toHaveBeenCalledTimes(2);
    expect(gateway.markRead).toHaveBeenCalledWith("older-notice");
    expect(gateway.markRead).not.toHaveBeenCalledWith("already-read");
    expect(gateway.listNotifications).toHaveBeenLastCalledWith(
      { cursor: "older-page" },
      expect.any(AbortSignal),
    );
    expect(client.getQueryState(keys.unreadCount)?.isInvalidated).toBe(true);
  });
  it("reports a bulk-read failure and reconciles any partial successes", async () => {
    vi.mocked(gateway.listNotifications).mockResolvedValue({
      items: [item],
      nextCursor: null,
    });
    vi.mocked(gateway.markRead).mockResolvedValue({ status: "unexpected" });
    const { result, client, keys } = setup();
    await act(async () => {
      await expect(result.current.markAllRead.mutateAsync()).rejects.toThrow(
        "Some notifications could not be marked read",
      );
    });
    expect(client.getQueryState(keys.unreadCount)?.isInvalidated).toBe(true);
  });
  it("stops the bulk action when its account scope unmounts", async () => {
    let release!: (page: {
      items: NotificationItem[];
      nextCursor: null;
    }) => void;
    vi.mocked(gateway.listNotifications).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result, unmount } = setup();
    let action!: Promise<void>;
    act(() => {
      action = result.current.markAllRead.mutateAsync();
    });
    const rejected = expect(action).rejects.toBeDefined();
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    release({ items: [item], nextCursor: null });
    await rejected;
    expect(gateway.markRead).not.toHaveBeenCalled();
  });
});
