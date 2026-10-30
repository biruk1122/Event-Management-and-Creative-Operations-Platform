"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./documents-gateway";
import type { UpdateDocumentValues } from "../lib/documents-outcome";

export function documentKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["documents", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    options: [...all, "options"] as const,
    detail: (id: string) => [...all, "document", id] as const,
  };
}

export function useDocumentsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["documents", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createDocument,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<UpdateDocumentValues>;
    }) => gateway.updateDocument(id, values),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteDocument,
    onSettled: reconcile,
  });

  return { create, update, remove };
}
