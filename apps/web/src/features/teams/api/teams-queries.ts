"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./teams-gateway";
import type { TeamProfileValues } from "../lib/teams-outcome";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function teamKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["teams", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    managers: [...all, "assignable-managers"] as const,
    departments: [...all, "assignable-departments"] as const,
    detail: (id: string) => [...all, "team", id] as const,
  };
}

export function useTeamsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access.
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["teams", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createTeam,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<TeamProfileValues>;
    }) => gateway.updateTeam(id, values),
    onSettled: reconcile,
  });
  const assignManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignTeamManager(id, managerId),
    onSettled: reconcile,
  });
  const addMember = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      gateway.addTeamMember(id, userId),
    onSettled: reconcile,
  });
  const removeMember = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      gateway.removeTeamMember(id, userId),
    onSettled: reconcile,
  });
  const deactivate = useMutation({
    mutationFn: gateway.deactivateTeam,
    onSettled: reconcile,
  });
  const reactivate = useMutation({
    mutationFn: gateway.reactivateTeam,
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteTeam,
    onSettled: reconcile,
  });

  return {
    create,
    update,
    assignManager,
    addMember,
    removeMember,
    deactivate,
    reactivate,
    remove,
  };
}
