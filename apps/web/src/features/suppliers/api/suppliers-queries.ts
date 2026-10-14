"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./suppliers-gateway";
import type { SupplierStatus } from "../lib/suppliers-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change never serves cache written under the old authority.
 */
export function supplierKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["suppliers", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    detail: (id: string) => [...all, "supplier", id] as const,
  };
}

export function useSuppliersMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["suppliers", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createSupplier,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<{
        name: string;
        category: string;
        contactName: string;
        contactEmail: string;
        contactPhone: string;
        notes: string;
        status: SupplierStatus;
      }>;
    }) => gateway.updateSupplier(id, values),
    onSettled: reconcile,
  });

  return { create, update };
}
