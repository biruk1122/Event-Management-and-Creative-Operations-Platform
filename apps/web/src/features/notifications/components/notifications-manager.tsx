"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useRealtimeConnection,
  type ConnectRealtime,
} from "@/features/realtime";

import {
  notificationsKeys,
  useNotificationsFeed,
  useNotificationsMutations,
  usePreferences,
  useUnreadCount,
} from "../api/notifications-queries";
import { NotificationsRequestError } from "../api/notifications-gateway";
import type { MutableNotificationType } from "../lib/notifications-types";
import {
  NotificationsCenter,
  type NotificationsViewState,
} from "./notifications-center";

export interface NotificationsManagerProps {
  access: CurrentAccess;
  /** Testing seam, mirroring `RealtimeStatusPanelProps.connect`; defaults to
   * the real `/realtime` handshake. */
  connect?: ConnectRealtime;
}

/** The `notification.invalidated` event name ADR 0004 §2's envelope carries
 * on the caller's own `user:<id>` room - forwarded verbatim by `onFrame`,
 * matched here since this is the only feature that cares about it today. */
const LIVE_EVENT = "notification.invalidated";

export function NotificationsManager({
  access,
  connect,
}: NotificationsManagerProps) {
  const client = useQueryClient();
  const keys = notificationsKeys(access);

  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.all });
  }, [client, keys.all]);

  // The frame's own payload is never trusted as data (ADR 0003 §5: real-time
  // is advisory-only) - receiving it only marks the REST-backed queries
  // stale, exactly like a reconnect does below.
  const connection = useRealtimeConnection(connect, (event) => {
    if (event === LIVE_EVENT) reconcile();
  });

  const everConnectedRef = useRef(false);
  useEffect(() => {
    if (connection.state.status === "connected") {
      if (everConnectedRef.current) reconcile();
      everConnectedRef.current = true;
    }
  }, [connection.state.status, reconcile]);

  const feed = useNotificationsFeed(access);
  const unread = useUnreadCount(access);
  const preferences = usePreferences(access);
  const mutations = useNotificationsMutations(access);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [pendingPreferences, setPendingPreferences] = useState<string[]>([]);

  async function markRead(id: string) {
    if (pendingIds.includes(id) || mutations.markAllRead.isPending) return;
    setActionError(null);
    setPendingIds((current) => [...current, id]);
    try {
      const result = await mutations.markRead.mutateAsync(id);
      if (result.status !== "success") {
        setActionError(
          "This notification could not be marked read. Please try again.",
        );
        if (result.status === "permission_denied")
          void client.invalidateQueries({ queryKey: accessKey });
      }
    } catch {
      setActionError(
        "This notification could not be marked read. Please try again.",
      );
    } finally {
      setPendingIds((current) => current.filter((value) => value !== id));
    }
  }
  async function markAllRead() {
    if (mutations.markAllRead.isPending || pendingIds.length > 0) return;
    setActionError(null);
    try {
      await mutations.markAllRead.mutateAsync();
    } catch {
      setActionError(
        "Some notifications could not be marked read. Please try again.",
      );
    }
  }
  async function remove(id: string) {
    if (pendingIds.includes(id) || mutations.markAllRead.isPending) return;
    setActionError(null);
    setPendingIds((current) => [...current, id]);
    setRemovingIds((current) => [...current, id]);
    try {
      await mutations.remove.mutateAsync(id);
    } catch (error) {
      setActionError(
        "This notification could not be removed. Please try again.",
      );
      if (
        error instanceof NotificationsRequestError &&
        [401, 403].includes(error.status)
      )
        void client.invalidateQueries({ queryKey: accessKey });
    } finally {
      setPendingIds((current) => current.filter((value) => value !== id));
      setRemovingIds((current) => current.filter((value) => value !== id));
    }
  }
  async function togglePreference(
    type: MutableNotificationType,
    muted: boolean,
  ) {
    if (pendingPreferences.includes(type)) return;
    setActionError(null);
    setPendingPreferences((current) => [...current, type]);
    try {
      const result = await mutations.setPreference.mutateAsync({ type, muted });
      if (result.status !== "success") {
        setActionError(
          "Your reminder preference could not be saved. Please try again.",
        );
        if (result.status === "permission_denied")
          void client.invalidateQueries({ queryKey: accessKey });
      }
    } catch {
      setActionError(
        "Your reminder preference could not be saved. Please try again.",
      );
    } finally {
      setPendingPreferences((current) =>
        current.filter((value) => value !== type),
      );
    }
  }

  // A 401/403 on any notifications query means the caller's authority
  // changed under them; re-check access so the screen can drop to its
  // denied/expired state, mirroring `DiscussManager`'s identical guard.
  useEffect(() => {
    for (const error of [feed.error, unread.error, preferences.error]) {
      if (
        error instanceof NotificationsRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        void client.invalidateQueries({ queryKey: accessKey });
        return;
      }
    }
  }, [feed.error, unread.error, preferences.error, client]);

  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = feed.hasNextPage ?? false;

  const state: NotificationsViewState = feed.isPending
    ? "loading"
    : feed.isError || unread.isError || preferences.isError
      ? "error"
      : connection.state.status === "reconnecting"
        ? "reconnecting"
        : connection.state.status === "denied"
          ? "disabled"
          : "ready";

  return (
    <NotificationsCenter
      items={items}
      unreadCount={unread.data ?? 0}
      hasMore={hasMore}
      loadingMore={feed.isFetchingNextPage}
      preferences={preferences.data ?? []}
      state={state}
      onRetry={() => {
        // The failure driving the "error" state above may be any of the
        // three queries, not necessarily the feed - retry all of them so
        // "Try again" recovers regardless of which one actually failed.
        void feed.refetch();
        void unread.refetch();
        void preferences.refetch();
      }}
      onLoadMore={() => void feed.fetchNextPage()}
      onMarkRead={(id) => void markRead(id)}
      onRemove={(id) => void remove(id)}
      onMarkAllRead={() => void markAllRead()}
      onTogglePreference={(type, muted) => void togglePreference(type, muted)}
      markingAll={mutations.markAllRead.isPending}
      pendingIds={pendingIds}
      removingIds={removingIds}
      pendingPreferences={pendingPreferences}
      actionError={actionError}
    />
  );
}
