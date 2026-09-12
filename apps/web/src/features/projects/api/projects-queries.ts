"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./projects-gateway";
import type { EditProjectValues } from "../lib/projects-outcome";
import type { ProjectStatus } from "../lib/projects-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function projectKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["projects", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    users: [...all, "assignable-users"] as const,
    teams: [...all, "assignable-teams"] as const,
    events: [...all, "assignable-events"] as const,
    detail: (id: string) => [...all, "project", id] as const,
  };
}

export function useProjectsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access.
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["projects", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createProject,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditProjectValues }) =>
      gateway.updateProject(id, values),
    onSettled: reconcile,
  });
  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) =>
      gateway.transitionProject(id, status),
    onSettled: reconcile,
  });
  const assignManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignProjectManager(id, managerId),
    onSettled: reconcile,
  });
  const assignTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.assignProjectTeam(id, teamId),
    onSettled: reconcile,
  });
  const removeTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.removeProjectTeam(id, teamId),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteProject,
    onSettled: reconcile,
  });

  return {
    create,
    update,
    transition,
    assignManager,
    assignTeam,
    removeTeam,
    remove,
  };
}
