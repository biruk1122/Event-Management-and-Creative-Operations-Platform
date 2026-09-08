"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./departments-gateway";
import type { DepartmentProfileValues } from "../lib/departments-outcome";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function departmentKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["departments", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    managers: [...all, "assignable-managers"] as const,
    detail: (id: string) => [...all, "department", id] as const,
  };
}

export function useDepartmentsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access.
  const reconcile = async () => {
    await client.invalidateQueries({
      queryKey: ["departments", access.userId],
    });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createDepartment,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<DepartmentProfileValues>;
    }) => gateway.updateDepartment(id, values),
    onSettled: reconcile,
  });
  const assignManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignDepartmentManager(id, managerId),
    onSettled: reconcile,
  });
  const deactivate = useMutation({
    mutationFn: gateway.deactivateDepartment,
    onSettled: reconcile,
  });
  const reactivate = useMutation({
    mutationFn: gateway.reactivateDepartment,
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteDepartment,
    onSettled: reconcile,
  });

  return { create, update, assignManager, deactivate, reactivate, remove };
}
