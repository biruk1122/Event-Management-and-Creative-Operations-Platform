"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./users-gateway";
import type { ProfileValues } from "../lib/users-outcome";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function userKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["users", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    roles: [...all, "assignable-roles"] as const,
    detail: (id: string) => [...all, "user", id] as const,
  };
}

export function useUsersMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access.
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["users", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createUser,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<ProfileValues>;
    }) => gateway.updateUser(id, values),
    onSettled: reconcile,
  });
  const deactivate = useMutation({
    mutationFn: gateway.deactivateUser,
    onSettled: reconcile,
  });
  const reactivate = useMutation({
    mutationFn: gateway.reactivateUser,
    onSettled: reconcile,
  });
  const assignRole = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string | null }) =>
      gateway.assignUserRole(id, roleId),
    onSettled: reconcile,
  });

  return { create, update, deactivate, reactivate, assignRole };
}
