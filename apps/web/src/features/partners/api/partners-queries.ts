"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./partners-gateway";
import type { PartnerStatus } from "../lib/partners-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change never serves cache written under the old authority.
 */
export function partnerKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["partners", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    detail: (id: string) => [...all, "partner", id] as const,
    activities: (id: string, page: number) =>
      [...all, "partner", id, "activities", page] as const,
  };
}

export function usePartnersMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["partners", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createPartner,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<{
        organizationName: string;
        category: string;
        contactName: string;
        contactEmail: string;
        contactPhone: string;
        proposedContribution: string;
        notes: string;
        followUpAt: string;
        status: PartnerStatus;
        ownerId: string | null;
      }>;
    }) => gateway.updatePartner(id, values),
    onSettled: reconcile,
  });
  const addActivity = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      gateway.createPartnerActivity(id, note),
    onSettled: reconcile,
  });

  return { create, update, addActivity };
}
