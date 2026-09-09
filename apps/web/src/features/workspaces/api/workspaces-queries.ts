"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./workspaces-gateway";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function workspaceKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["workspaces", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    users: [...all, "assignable-users"] as const,
    teams: [...all, "assignable-teams"] as const,
    detail: (id: string) => [...all, "workspace", id] as const,
  };
}

export function useWorkspacesMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access.
  const reconcile = async () => {
    await client.invalidateQueries({
      queryKey: ["workspaces", access.userId],
    });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createWorkspace,
    onSettled: reconcile,
  });
  const assignManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignWorkspaceManager(id, managerId),
    onSettled: reconcile,
  });
  const assignTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.assignWorkspaceTeam(id, teamId),
    onSettled: reconcile,
  });
  const removeTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.removeWorkspaceTeam(id, teamId),
    onSettled: reconcile,
  });
  const addParticipant = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      gateway.addWorkspaceParticipant(id, userId),
    onSettled: reconcile,
  });
  const removeParticipant = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      gateway.removeWorkspaceParticipant(id, userId),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteWorkspace,
    onSettled: reconcile,
  });

  return {
    create,
    assignManager,
    assignTeam,
    removeTeam,
    addParticipant,
    removeParticipant,
    remove,
  };
}
