"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./talent-gateway";
import type {
  EditTalentValues,
  TalentAssignmentValues,
  TalentScheduleValues,
  TalentSocialLinkValues,
} from "../lib/talent-outcome";
import type {
  TalentAssignmentStatus,
  TalentAvailability,
} from "../lib/talent-types";

/**
 * Query keys namespaced by the acting user and a signature of their grants, so
 * a permission change (new grant, revoked grant, different account) never
 * serves cache written under the old authority.
 */
export function talentKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["talent", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    users: [...all, "assignable-users"] as const,
    events: [...all, "assignable-events"] as const,
    detail: (id: string) => [...all, "talent", id] as const,
  };
}

export function useTalentMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["talent", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  const create = useMutation({
    mutationFn: gateway.createTalent,
    onSettled: reconcile,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditTalentValues }) =>
      gateway.updateTalent(id, values),
    onSettled: reconcile,
  });
  const transition = useMutation({
    mutationFn: ({
      id,
      availability,
    }: {
      id: string;
      availability: TalentAvailability;
    }) => gateway.transitionTalent(id, availability),
    onSettled: reconcile,
  });
  const setManager = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      gateway.setTalentManager(id, managerId),
    onSettled: reconcile,
  });
  const addSocialLink = useMutation({
    mutationFn: ({
      talentId,
      values,
    }: {
      talentId: string;
      values: TalentSocialLinkValues;
    }) => gateway.addSocialLink(talentId, values),
    onSettled: reconcile,
  });
  const removeSocialLink = useMutation({
    mutationFn: ({
      talentId,
      socialLinkId,
    }: {
      talentId: string;
      socialLinkId: string;
    }) => gateway.removeSocialLink(talentId, socialLinkId),
    onSettled: reconcile,
  });
  const addSchedule = useMutation({
    mutationFn: ({
      talentId,
      values,
    }: {
      talentId: string;
      values: TalentScheduleValues;
    }) => gateway.addSchedule(talentId, values),
    onSettled: reconcile,
  });
  const updateSchedule = useMutation({
    mutationFn: ({
      talentId,
      scheduleId,
      values,
    }: {
      talentId: string;
      scheduleId: string;
      values: TalentScheduleValues;
    }) => gateway.updateSchedule(talentId, scheduleId, values),
    onSettled: reconcile,
  });
  const removeSchedule = useMutation({
    mutationFn: ({
      talentId,
      scheduleId,
    }: {
      talentId: string;
      scheduleId: string;
    }) => gateway.removeSchedule(talentId, scheduleId),
    onSettled: reconcile,
  });
  const assignEvent = useMutation({
    mutationFn: ({
      talentId,
      values,
    }: {
      talentId: string;
      values: TalentAssignmentValues;
    }) => gateway.assignEvent(talentId, values),
    onSettled: reconcile,
  });
  const transitionAssignment = useMutation({
    mutationFn: ({
      talentId,
      assignmentId,
      status,
    }: {
      talentId: string;
      assignmentId: string;
      status: TalentAssignmentStatus;
    }) => gateway.transitionAssignment(talentId, assignmentId, status),
    onSettled: reconcile,
  });

  return {
    create,
    update,
    transition,
    setManager,
    addSocialLink,
    removeSocialLink,
    addSchedule,
    updateSchedule,
    removeSchedule,
    assignEvent,
    transitionAssignment,
  };
}
