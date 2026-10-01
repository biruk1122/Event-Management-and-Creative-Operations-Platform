"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { listDepartments } from "@/features/departments/api/departments-gateway";
import { listUsers } from "@/features/users/api/users-gateway";
import { readableKinds } from "@/features/workspaces/lib/workspace-access";
import { listWorkspaces } from "@/features/workspaces/api/workspaces-gateway";

import {
  exportReport,
  getReport,
  listReports,
  ReportsRequestError,
} from "../api/reports-gateway";
import { reportKeys, useReportsMutations } from "../api/reports-queries";
import { reportAbilities } from "../lib/reports-access";
import type {
  CreateReport,
  ReportFilters,
  ReviewOutcome,
} from "../lib/report-presentation";
import { ReportsWorkspace } from "./reports-workspace";

const PAGE_SIZE = 10;
const INITIAL_FILTERS: ReportFilters = {
  type: null,
  status: null,
  periodFrom: "",
  periodTo: "",
};

type Notice = { kind: "success" | "error"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The report request failed. Try again.";
}

function downloadReport(id: string, content: unknown) {
  const blob = new Blob([JSON.stringify(content, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `report-${id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportsManager({ access }: { access: CurrentAccess }) {
  const client = useQueryClient();
  const keys = reportKeys(access);
  const abilities = reportAbilities(access);
  const kinds = readableKinds(access);
  const [filters, setFilters] = useState<ReportFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const params = { ...filters, page, pageSize: PAGE_SIZE };

  const listQuery = useQuery({
    queryKey: keys.list(params),
    queryFn: ({ signal }) => listReports(params, signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const detailQuery = useQuery({
    queryKey: keys.detail(selectedId ?? ""),
    queryFn: ({ signal }) => getReport(selectedId!, signal),
    enabled: selectedId !== null,
    retry: false,
    refetchOnWindowFocus: true,
  });

  // Enrichment is optional. The reports API, not these directory queries,
  // performs the report visibility check and supplies all report metrics.
  const usersQuery = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listUsers({ page: 1, pageSize: 100 }, signal),
    enabled:
      abilities.audience === "management" &&
      access.grants.some((grant) => grant.permissionKey === "user.read"),
    retry: false,
    staleTime: 60_000,
  });
  const departmentsQuery = useQuery({
    queryKey: keys.departments,
    queryFn: ({ signal }) =>
      listDepartments({ page: 1, pageSize: 100 }, signal),
    enabled:
      abilities.audience === "management" &&
      access.grants.some((grant) => grant.permissionKey === "department.read"),
    retry: false,
    staleTime: 60_000,
  });
  const workspacesQuery = useQuery({
    queryKey: keys.workspaces,
    queryFn: async ({ signal }) => {
      const results = await Promise.allSettled(
        kinds.map((kind) =>
          listWorkspaces({ kind, page: 1, pageSize: 100 }, signal),
        ),
      );
      return {
        choices: results.flatMap((result, index) =>
          result.status === "fulfilled"
            ? result.value.items.map((workspace) => ({
                id: workspace.id,
                name: `${kinds[index]} workspace ${workspace.id.slice(0, 8)}`,
              }))
            : [],
        ),
        partial: results.some(
          (result) =>
            result.status === "rejected" ||
            result.value.total > result.value.items.length,
        ),
      };
    },
    enabled: kinds.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  const mutations = useReportsMutations(access);
  const busy =
    mutations.create.isPending ||
    mutations.update.isPending ||
    mutations.submit.isPending ||
    mutations.review.isPending;

  useEffect(() => {
    const error = listQuery.error ?? detailQuery.error;
    if (
      error instanceof ReportsRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [client, listQuery.error, detailQuery.error]);

  const authorNames = useMemo(
    () =>
      Object.fromEntries(
        (usersQuery.data?.items ?? []).map((user) => [
          user.id,
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.email,
        ]),
      ),
    [usersQuery.data],
  );
  const departmentNames = useMemo(
    () =>
      Object.fromEntries(
        (departmentsQuery.data?.items ?? []).map((department) => [
          department.id,
          department.name,
        ]),
      ),
    [departmentsQuery.data],
  );

  const authError =
    listQuery.error instanceof ReportsRequestError &&
    (listQuery.error.status === 401 || listQuery.error.status === 403);
  const lookupPartial =
    usersQuery.isError ||
    departmentsQuery.isError ||
    workspacesQuery.isError ||
    workspacesQuery.data?.partial;
  const displayNotice =
    notice ??
    (lookupPartial
      ? {
          kind: "error" as const,
          message:
            "Some directory or workspace choices are unavailable. Reports remain available; refresh to retry.",
        }
      : listQuery.isError && listQuery.data
        ? {
            kind: "error" as const,
            message: "Could not refresh reports. Showing the last loaded page.",
          }
        : null);

  async function saveDraft(
    values: CreateReport,
    reportId?: string,
  ): Promise<boolean> {
    try {
      const saved = reportId
        ? await mutations.update.mutateAsync({ id: reportId, values })
        : await mutations.create.mutateAsync(values);
      setNotice({ kind: "success", message: "Report draft saved." });
      setPage(1);
      setSelectedId(saved.id);
      return true;
    } catch (error) {
      setNotice({ kind: "error", message: messageOf(error) });
      return false;
    }
  }

  async function submit(id: string) {
    try {
      await mutations.submit.mutateAsync(id);
      setNotice({ kind: "success", message: "Report submitted for review." });
    } catch (error) {
      setNotice({ kind: "error", message: messageOf(error) });
    }
  }

  async function review(id: string, outcome: ReviewOutcome, note: string) {
    try {
      await mutations.review.mutateAsync({ id, outcome, note });
      setNotice({
        kind: "success",
        message:
          outcome === "REVIEWED" ? "Report reviewed." : "Changes requested.",
      });
    } catch (error) {
      setNotice({ kind: "error", message: messageOf(error) });
    }
  }

  async function exportSelected(id: string) {
    try {
      const snapshot = await exportReport(id);
      downloadReport(id, snapshot);
      setNotice({ kind: "success", message: "Report exported." });
    } catch (error) {
      setNotice({ kind: "error", message: messageOf(error) });
    }
  }

  return (
    <ReportsWorkspace
      state={
        authError
          ? "denied"
          : listQuery.isPending
            ? "loading"
            : listQuery.isError && !listQuery.data
              ? "error"
              : "ready"
      }
      audience={abilities.audience}
      currentUserId={access.userId}
      list={listQuery.data}
      selectedId={selectedId}
      detail={detailQuery.data}
      detailState={
        detailQuery.isPending
          ? "loading"
          : detailQuery.isError
            ? "error"
            : "ready"
      }
      filters={filters}
      authorNames={authorNames}
      departmentNames={departmentNames}
      workspaces={workspacesQuery.data?.choices ?? []}
      workspaceWarning={
        workspacesQuery.data?.partial
          ? "Only some authorized workspaces could be listed. Existing links are preserved."
          : null
      }
      canCreate={abilities.canCreate}
      canReview={abilities.canReview}
      busy={busy}
      notice={displayNotice}
      errorMessage={
        listQuery.error instanceof Error ? listQuery.error.message : undefined
      }
      onRetry={() => {
        void listQuery.refetch();
        if (selectedId) void detailQuery.refetch();
        if (kinds.length > 0) void workspacesQuery.refetch();
      }}
      onFiltersChange={(next) => {
        setFilters(next);
        setPage(1);
        setSelectedId(null);
        setNotice(null);
      }}
      onPageChange={(next) => {
        setPage(next);
        setSelectedId(null);
      }}
      onSelect={setSelectedId}
      onSaveDraft={abilities.canCreate ? saveDraft : undefined}
      onSubmit={
        abilities.canSubmit
          ? (id) => {
              void submit(id);
            }
          : undefined
      }
      onReview={
        abilities.canReview
          ? (id, outcome, note) => {
              void review(id, outcome, note);
            }
          : undefined
      }
      onExport={(id) => {
        void exportSelected(id);
      }}
    />
  );
}
