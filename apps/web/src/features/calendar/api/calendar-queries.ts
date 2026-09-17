"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./calendar-gateway";
import type { CalendarEntryFormValues } from "../lib/calendar-outcome";

/** Query keys namespaced by the acting user and a signature of their grants,
 * matching `notificationsKeys`'s own convention - a permission change never
 * serves cache written under a different authority. */
export function calendarKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["calendar", access.userId, scope] as const;
  return {
    all,
    range: (from: string, to: string) => [...all, "range", from, to] as const,
  };
}

export function useCalendarRange(
  access: CurrentAccess,
  params: { from: string; to: string },
) {
  const keys = calendarKeys(access);
  return useQuery({
    queryKey: keys.range(params.from, params.to),
    queryFn: ({ signal }) => gateway.listCalendarEntries(params, signal),
    // Every prev/next/today click and every view switch changes the range
    // query key; without this, each one would unmount the whole calendar
    // (toolbar included) to a bare loading state, matching the pagination
    // convention every other list manager in this repo already follows
    // (tasks-manager.tsx et al.).
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useCalendarMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = calendarKeys(access);
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: keys.all });
  };

  return {
    create: useMutation({
      mutationFn: gateway.createCalendarEntry,
      onSettled: reconcile,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        values,
      }: {
        id: string;
        values: CalendarEntryFormValues;
      }) => gateway.updateCalendarEntry(id, values),
      onSettled: reconcile,
    }),
    remove: useMutation({
      mutationFn: gateway.deleteCalendarEntry,
      onSettled: reconcile,
    }),
  };
}
