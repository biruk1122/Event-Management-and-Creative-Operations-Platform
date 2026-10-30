"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./tasks-gateway";

/** Query keys are scoped to both the current user and their effective grants. */
export function taskKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["tasks", access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    detail: (id: string) => [...all, "detail", id] as const,
    assignees: [...all, "assignable-users"] as const,
    eligibleAssignees: (departmentId: string) =>
      [...all, "eligible-assignees", departmentId] as const,
  };
}

export function useTaskMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["tasks", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };
  return {
    create: useMutation({
      mutationFn: (params: gateway.CreateTaskParams) =>
        gateway.createTask(params),
      onSettled: reconcile,
    }),
    comment: useMutation({
      mutationFn: ({ id, content }: { id: string; content: string }) =>
        gateway.createTaskComment(id, content),
      onSettled: reconcile,
    }),
    addChecklistItem: useMutation({
      mutationFn: ({ id, description }: { id: string; description: string }) =>
        gateway.addTaskChecklistItem(id, description),
      onSettled: reconcile,
    }),
    removeChecklistItem: useMutation({
      mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
        gateway.removeTaskChecklistItem(id, itemId),
      onSettled: reconcile,
    }),
    reorderChecklistItems: useMutation({
      mutationFn: ({
        id,
        orderedItemIds,
      }: {
        id: string;
        orderedItemIds: string[];
      }) => gateway.reorderTaskChecklistItems(id, orderedItemIds),
      onSettled: reconcile,
    }),
    toggleChecklistItem: useMutation({
      mutationFn: ({
        id,
        itemId,
        completed,
      }: {
        id: string;
        itemId: string;
        completed: boolean;
      }) => gateway.toggleTaskChecklistItem(id, itemId, completed),
      onSettled: reconcile,
    }),
    transition: useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: import("../lib/tasks-types").TaskStatus;
      }) => gateway.transitionTask(id, status),
      onSettled: reconcile,
    }),
    submit: useMutation({
      mutationFn: gateway.submitTask,
      onSettled: reconcile,
    }),
    review: useMutation({
      mutationFn: ({
        id,
        outcome,
        note,
      }: {
        id: string;
        outcome: "APPROVED" | "CHANGES_REQUESTED";
        note: string;
      }) => gateway.reviewTask(id, outcome, note),
      onSettled: reconcile,
    }),
    upload: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) =>
        gateway.uploadTaskFile(id, file),
      onSettled: reconcile,
    }),
    addAssignee: useMutation({
      mutationFn: ({ id, userId }: { id: string; userId: string }) =>
        gateway.addTaskAssignee(id, userId),
      onSettled: reconcile,
    }),
    removeAssignee: useMutation({
      mutationFn: ({ id, userId }: { id: string; userId: string }) =>
        gateway.removeTaskAssignee(id, userId),
      onSettled: reconcile,
    }),
  };
}
