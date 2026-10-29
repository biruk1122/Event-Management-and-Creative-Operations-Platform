"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./employees-gateway";
import type { EmployeeHrValues } from "../lib/employees-outcome";
import type { EmploymentStatus } from "../lib/employees-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants,
 * so a permission change never serves cache written under the old authority.
 */
export function employeeKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["employees", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    options: [...all, "options"] as const,
    detail: (id: string) => [...all, "employee", id] as const,
  };
}

export function useEmployeesMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["employees", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const register = useMutation({
    mutationFn: gateway.registerEmployee,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<EmployeeHrValues>;
    }) => gateway.updateEmployee(id, values),
    onSettled: reconcile,
  });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EmploymentStatus }) =>
      gateway.updateEmployeeStatus(id, status),
    onSettled: reconcile,
  });

  return { register, update, updateStatus };
}
