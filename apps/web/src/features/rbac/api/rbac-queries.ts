"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import * as gateway from "./rbac-gateway";
import type { RoleFormValues } from "../lib/rbac-outcome";
import type { PermissionScope } from "../lib/rbac-types";

export function rbacKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["rbac", access.userId, scope] as const;
  return {
    all,
    roles: [...all, "roles"] as const,
    permissions: [...all, "permissions"] as const,
    detail: (id: string) => [...all, "role", id] as const,
  };
}

export function useRbacMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile ambiguous network failures and conflicts against persistence too.
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["rbac", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };
  const create = useMutation({
    mutationFn: gateway.createRole,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: RoleFormValues }) =>
      gateway.updateRole(id, values),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteRole,
    onSettled: reconcile,
  });
  const add = useMutation({
    mutationFn: ({
      id,
      key,
      scope,
    }: {
      id: string;
      key: string;
      scope: PermissionScope;
    }) => gateway.addGrant(id, key, scope),
    onSettled: reconcile,
  });
  const revoke = useMutation({
    mutationFn: ({
      id,
      key,
      scope,
    }: {
      id: string;
      key: string;
      scope: PermissionScope;
    }) => gateway.removeGrant(id, key, scope),
    onSettled: reconcile,
  });
  return { create, update, remove, add, revoke };
}
