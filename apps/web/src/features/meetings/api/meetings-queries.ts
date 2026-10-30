"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./meetings-gateway";

export function meetingsKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["meetings", access.userId, scope] as const;
  return { all, list: [...all, "list"] as const };
}

export function useMeetings(access: CurrentAccess) {
  const keys = meetingsKeys(access);
  return useInfiniteQuery({
    queryKey: keys.list,
    queryFn: ({ pageParam, signal }) => gateway.listMeetings(pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total
        ? lastPage.page + 1
        : undefined,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useMeetingMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = meetingsKeys(access);
  return {
    remove: useMutation({
      mutationFn: gateway.removeMeeting,
      onSuccess: async (_, id) => {
        // A selected deep-linked meeting can have an active detail observer.
        // Clear its data without re-fetching the now-deleted resource.
        client.setQueryData([...keys.all, "detail", id], null);
        client.setQueriesData<InfiniteData<gateway.MeetingsPage>>(
          { queryKey: keys.list },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    total: Math.max(0, page.total - 1),
                    items: page.items.filter((item) => item.id !== id),
                  })),
                }
              : data,
        );
        await Promise.all([
          client.invalidateQueries({ queryKey: ["calendar", access.userId] }),
          client.invalidateQueries({
            queryKey: ["notifications", access.userId],
          }),
        ]);
      },
      onSettled: () => client.invalidateQueries({ queryKey: keys.list }),
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: gateway.UpdateMeetingInput;
      }) => gateway.updateMeeting(id, input),
      onSuccess: async (meeting) => {
        client.setQueryData([...keys.all, "detail", meeting.id], meeting);
        client.setQueriesData<InfiniteData<gateway.MeetingsPage>>(
          { queryKey: keys.list },
          (data) =>
            data
              ? {
                  ...data,
                  pages: data.pages.map((page) => ({
                    ...page,
                    items: page.items.map((item) =>
                      item.id === meeting.id ? meeting : item,
                    ),
                  })),
                }
              : data,
        );
        await client.invalidateQueries({
          queryKey: ["calendar", access.userId],
        });
      },
      onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
    }),
    create: useMutation({
      mutationFn: gateway.createMeeting,
      onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
    }),
    respond: useMutation({
      mutationFn: ({
        id,
        response,
      }: {
        id: string;
        response: gateway.MeetingResponseAnswer;
      }) => gateway.respondToMeeting(id, response),
      // REST remains authoritative. This covers both a successful write and
      // a conflict caused by an update made by another participant.
      onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
    }),
    setMinutes: useMutation({
      mutationFn: ({ id, minutes }: { id: string; minutes: string }) =>
        gateway.setMeetingMinutes(id, minutes),
      onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
    }),
    createActionItem: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: gateway.CreateActionItemInput;
      }) => gateway.createMeetingActionItem(id, input),
    }),
    transition: useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: "COMPLETED" | "CANCELLED";
      }) => gateway.transitionMeeting(id, status),
      onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
    }),
  };
}
