"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./letters-gateway";
import type { UpdateLetterValues } from "../lib/letters-outcome";

export function letterKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["letters", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    options: [...all, "options"] as const,
    detail: (id: string) => [...all, "letter", id] as const,
    remarks: (id: string) => [...all, "letter", id, "remarks"] as const,
  };
}

export function useLettersMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["letters", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createLetter,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<UpdateLetterValues>;
    }) => gateway.updateLetter(id, values),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteLetter,
    onSettled: reconcile,
  });
  const addRemark = useMutation({
    mutationFn: ({ letterId, body }: { letterId: string; body: string }) =>
      gateway.addRemark(letterId, body),
  });

  return { create, update, remove, addRemark };
}
