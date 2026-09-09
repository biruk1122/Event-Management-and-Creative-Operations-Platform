"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./events-gateway";
import type { EditEventValues } from "../lib/events-outcome";
import type { EventStatus } from "../lib/events-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function eventKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["events", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    users: [...all, "assignable-users"] as const,
    teams: [...all, "assignable-teams"] as const,
    detail: (id: string) => [...all, "event", id] as const,
    budget: (id: string) => [...all, "event", id, "budget"] as const,
  };
}

export function useEventsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access.
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["events", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createEvent,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditEventValues }) =>
      gateway.updateEvent(id, values),
    onSettled: reconcile,
  });
  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) =>
      gateway.transitionEvent(id, status),
    onSettled: reconcile,
  });
  const assignManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignEventManager(id, managerId),
    onSettled: reconcile,
  });
  const assignTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.assignEventTeam(id, teamId),
    onSettled: reconcile,
  });
  const removeTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.removeEventTeam(id, teamId),
    onSettled: reconcile,
  });
  const setBudget = useMutation({
    mutationFn: ({
      id,
      amount,
      currency,
    }: {
      id: string;
      amount: number | null;
      currency: string | null;
    }) => gateway.setEventBudget(id, amount, currency),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteEvent,
    onSettled: reconcile,
  });

  return {
    create,
    update,
    transition,
    assignManager,
    assignTeam,
    removeTeam,
    setBudget,
    remove,
  };
}
