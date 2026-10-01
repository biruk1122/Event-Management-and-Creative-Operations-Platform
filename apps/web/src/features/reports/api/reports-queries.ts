"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./reports-gateway";
import type { CreateReport, ReviewOutcome } from "../lib/report-presentation";

export function reportKeys(access: CurrentAccess) {
  const grants = [
    ...new Set(access.grants.map((g) => `${g.permissionKey}:${g.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["reports", access.userId, grants] as const;
  return {
    all,
    list: (params: gateway.ListReportsParams) =>
      [...all, "list", params] as const,
    detail: (id: string) => [...all, "detail", id] as const,
    workspaces: [...all, "workspaces"] as const,
    users: [...all, "users"] as const,
    departments: [...all, "departments"] as const,
  };
}

export function useReportsMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: ["reports", access.userId] });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  return {
    create: useMutation({
      mutationFn: gateway.createReport,
      onSettled: reconcile,
    }),
    update: useMutation({
      mutationFn: ({ id, values }: { id: string; values: CreateReport }) =>
        gateway.updateReport(id, values),
      onSettled: reconcile,
    }),
    submit: useMutation({
      mutationFn: gateway.submitReport,
      onSettled: reconcile,
    }),
    review: useMutation({
      mutationFn: ({
        id,
        outcome,
        note,
      }: {
        id: string;
        outcome: ReviewOutcome;
        note: string;
      }) => gateway.reviewReport(id, outcome, note),
      onSettled: reconcile,
    }),
  };
}
