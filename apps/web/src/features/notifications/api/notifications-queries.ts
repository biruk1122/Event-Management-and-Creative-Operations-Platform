"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./notifications-gateway";

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
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: keys.all });
  };

  return {
    markRead: useMutation({
      mutationFn: gateway.markRead,
      onSettled: reconcile,
    }),
    setPreference: useMutation({
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
