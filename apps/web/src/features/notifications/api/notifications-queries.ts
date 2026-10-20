"use client";
import { useEffect, useRef } from "react";

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./notifications-gateway";
import type { NotificationFeed } from "../lib/notifications-types";

/** Query keys namespaced by the acting user and a signature of their grants,
 * matching `discussKeys`'s own convention - a permission change never serves
 * cache written under a different authority. */
export function notificationsKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["notifications", access.userId, scope] as const;
  return {
    all,
    feed: [...all, "feed"] as const,
    unreadCount: [...all, "unread-count"] as const,
    preferences: [...all, "preferences"] as const,
  };
}

export function useNotificationsFeed(access: CurrentAccess) {
  const keys = notificationsKeys(access);
  return useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam, signal }) =>
      gateway.listNotifications(pageParam ? { cursor: pageParam } : {}, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount(access: CurrentAccess) {
  const keys = notificationsKeys(access);
  return useQuery({
    queryKey: keys.unreadCount,
    queryFn: ({ signal }) => gateway.unreadCount(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function usePreferences(access: CurrentAccess) {
  const keys = notificationsKeys(access);
  return useQuery({
    queryKey: keys.preferences,
    queryFn: ({ signal }) => gateway.listPreferences(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = notificationsKeys(access);
  const batch = useRef<AbortController | null>(null);
  const scope = keys.all[2];
  useEffect(() => () => batch.current?.abort(), [access.userId, scope]);
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: keys.all });
  };

  return {
    remove: useMutation({
      mutationKey: ["notifications", "remove"],
      mutationFn: gateway.removeNotification,
      onSuccess: async (_, id) => {
        await Promise.all([
          client.cancelQueries({ queryKey: keys.feed }),
          client.cancelQueries({ queryKey: keys.unreadCount }),
        ]);
        const feed = client.getQueryData<InfiniteData<NotificationFeed>>(
          keys.feed,
        );
        const wasUnread = feed?.pages.some((page) =>
          page.items.some((item) => item.id === id && item.readAt === null),
        );
        client.setQueryData<InfiniteData<NotificationFeed>>(
          keys.feed,
          (current) =>
            current
              ? {
                  ...current,
                  pages: current.pages.map((page) => ({
                    ...page,
                    items: page.items.filter((item) => item.id !== id),
                  })),
                }
              : current,
        );
        if (wasUnread)
          client.setQueryData<number>(keys.unreadCount, (count) =>
            count === undefined ? count : Math.max(0, count - 1),
          );
      },
      onSettled: reconcile,
    }),
    markAllRead: useMutation({
      mutationKey: ["notifications", "mark-all-read"],
      mutationFn: async () => {
        batch.current?.abort();
        const controller = new AbortController();
        batch.current = controller;
        let cursor: string | undefined;
        do {
          controller.signal.throwIfAborted();
          const page = await gateway.listNotifications(
            cursor ? { cursor } : {},
            controller.signal,
          );
          for (const item of page.items) {
            controller.signal.throwIfAborted();
            if (item.readAt !== null) continue;
            const outcome = await gateway.markRead(item.id);
            if (
              outcome.status !== "success" &&
              outcome.status !== "not_found"
            ) {
              throw new Error(
                "Some notifications could not be marked read. Please try again.",
              );
            }
          }
          if (page.nextCursor && page.nextCursor === cursor)
            throw new Error(
              "Notifications could not finish loading. Please try again.",
            );
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
      },
      onSettled: reconcile,
    }),
    markRead: useMutation({
      mutationKey: ["notifications", "mark-read"],
      mutationFn: gateway.markRead,
      onSuccess: async (result, id) => {
        if (result.status !== "success") return;
        // An older in-flight GET must not replace the acknowledged read state.
        await Promise.all([
          client.cancelQueries({ queryKey: keys.feed }),
          client.cancelQueries({ queryKey: keys.unreadCount }),
        ]);
        const feed = client.getQueryData<InfiniteData<NotificationFeed>>(
          keys.feed,
        );
        const wasUnread = feed?.pages.some((page) =>
          page.items.some((item) => item.id === id && item.readAt === null),
        );
        client.setQueryData<InfiniteData<NotificationFeed>>(
          keys.feed,
          (current) =>
            current
              ? {
                  ...current,
                  pages: current.pages.map((page) => ({
                    ...page,
                    items: page.items.map((item) =>
                      item.id === id
                        ? { ...item, ...result.notification }
                        : item,
                    ),
                  })),
                }
              : current,
        );
        if (wasUnread) {
          client.setQueryData<number>(keys.unreadCount, (count) =>
            count === undefined ? count : Math.max(0, count - 1),
          );
        }
      },
      onSettled: reconcile,
    }),
    setPreference: useMutation({
      mutationKey: ["notifications", "preferences"],
      mutationFn: ({ type, muted }: { type: string; muted: boolean }) =>
        gateway.setPreference(type, muted),
      onSettled: reconcile,
    }),
  };
}

/** Invalidates every notifications query for this user - the reconciliation
 * ADR 0003 §5 requires on connect, reconnect, or a live `notification.
 * invalidated` frame. REST stays authoritative either way: this only marks
 * the cache stale, it never trusts the frame's own payload as data. */
export function useReconcileNotifications(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = notificationsKeys(access);
  return () => client.invalidateQueries({ queryKey: keys.all });
}
