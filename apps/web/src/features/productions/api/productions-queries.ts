"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./productions-gateway";
import type { ProductionValues } from "../components/production-form";
import type { Production, ProductionStatus } from "../lib/production-types";

export function productionKeys(access: CurrentAccess) {
  const grants = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["productions", access.userId, grants] as const;
  return {
    all,
    list: (params: gateway.ListProductionsParams) =>
      [...all, "list", params] as const,
    detail: (id: string) => [...all, "detail", id] as const,
    people: [...all, "people"] as const,
    teams: [...all, "teams"] as const,
    talents: [...all, "talents"] as const,
  };
}

export function useProductionMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = productionKeys(access);
  const apply = (production: Production) => {
    client.setQueryData(keys.detail(production.id), production);
    client.setQueriesData<gateway.PaginatedProductions>(
      { queryKey: [...keys.all, "list"] },
      (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === production.id ? production : item,
              ),
            }
          : current,
    );
  };
  const reconcile = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: keys.all }),
      client.invalidateQueries({ queryKey: ["workspaces", access.userId] }),
      client.invalidateQueries({ queryKey: ["tasks", access.userId] }),
      client.invalidateQueries({ queryKey: ["calendar", access.userId] }),
      client.invalidateQueries({ queryKey: ["meetings", access.userId] }),
      client.invalidateQueries({ queryKey: ["discuss"] }),
      client.invalidateQueries({ queryKey: ["talent", access.userId] }),
      client.invalidateQueries({ queryKey: accessKey }),
    ]);
  };
  const create = useMutation({
    mutationFn: gateway.createProduction,
    onSuccess: apply,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProductionValues }) =>
      gateway.updateProduction(id, values),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductionStatus }) =>
      gateway.transitionProduction(id, status),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const manager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignProductionManager(id, managerId),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const assignTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.assignProductionTeam(id, teamId),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const removeTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.removeProductionTeam(id, teamId),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const addMember = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      gateway.addProductionMember(id, userId),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const removeMember = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      gateway.removeProductionMember(id, userId),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const assignTalent = useMutation({
    mutationFn: ({
      id,
      talentId,
      role,
    }: {
      id: string;
      talentId: string;
      role: string;
    }) => gateway.assignProductionTalent(id, talentId, role),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const removeTalent = useMutation({
    mutationFn: ({ id, talentId }: { id: string; talentId: string }) =>
      gateway.removeProductionTalent(id, talentId),
    onSuccess: apply,
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteProduction,
    onSuccess: (_, id) => client.removeQueries({ queryKey: keys.detail(id) }),
    onSettled: reconcile,
  });
  return {
    create,
    update,
    transition,
    manager,
    assignTeam,
    removeTeam,
    addMember,
    removeMember,
    assignTalent,
    removeTalent,
    remove,
  };
}
