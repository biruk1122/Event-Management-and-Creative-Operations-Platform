"use client";

import { useCallback, useEffect, useRef } from "react";
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
    : feed.isError
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
      onRetry={() => void feed.refetch()}
      onLoadMore={() => void feed.fetchNextPage()}
      onMarkRead={(id) => void mutations.markRead.mutateAsync(id)}
      onTogglePreference={(type: MutableNotificationType, muted: boolean) =>
        void mutations.setPreference.mutateAsync({ type, muted })
      }
    />
  );
}
