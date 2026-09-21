"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./campaigns-gateway";
import type {
  CampaignActivityValues,
  EditCampaignValues,
} from "../lib/campaigns-outcome";
import type { CampaignStatus } from "../lib/campaigns-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function campaignKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["campaigns", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    users: [...all, "assignable-users"] as const,
    teams: [...all, "assignable-teams"] as const,
    events: [...all, "assignable-events"] as const,
    detail: (id: string) => [...all, "campaign", id] as const,
  };
}

export function useCampaignsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  // Reconcile against persistence after every attempt, including ambiguous
  // network failures, and re-check the caller's access. A campaign's manager,
  // teams, and existence live on its connected workspace, so the workspace
  // cache is refreshed too and the two screens never disagree.
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["campaigns", access.userId] });
    await client.invalidateQueries({
      queryKey: ["workspaces", access.userId],
    });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createCampaign,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditCampaignValues }) =>
      gateway.updateCampaign(id, values),
    onSettled: reconcile,
  });
  const transition = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CampaignStatus }) =>
      gateway.transitionCampaign(id, status),
    onSettled: reconcile,
  });
  const assignManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.assignCampaignManager(id, managerId),
    onSettled: reconcile,
  });
  const assignTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.assignCampaignTeam(id, teamId),
    onSettled: reconcile,
  });
  const removeTeam = useMutation({
    mutationFn: ({ id, teamId }: { id: string; teamId: string }) =>
      gateway.removeCampaignTeam(id, teamId),
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
    }) => gateway.setCampaignBudget(id, amount, currency),
    onSettled: reconcile,
  });
  const remove = useMutation({
    mutationFn: gateway.deleteCampaign,
    onSettled: reconcile,
  });
  const createActivity = useMutation({
    mutationFn: ({
      campaignId,
      values,
    }: {
      campaignId: string;
      values: CampaignActivityValues;
    }) => gateway.createCampaignActivity(campaignId, values),
    onSettled: reconcile,
  });
  const updateActivity = useMutation({
    mutationFn: ({
      campaignId,
      activityId,
      values,
    }: {
      campaignId: string;
      activityId: string;
      values: CampaignActivityValues;
    }) => gateway.updateCampaignActivity(campaignId, activityId, values),
    onSettled: reconcile,
  });
  const removeActivity = useMutation({
    mutationFn: ({
      campaignId,
      activityId,
    }: {
      campaignId: string;
      activityId: string;
    }) => gateway.deleteCampaignActivity(campaignId, activityId),
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
    createActivity,
    updateActivity,
    removeActivity,
  };
}
