"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

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
  };
}
