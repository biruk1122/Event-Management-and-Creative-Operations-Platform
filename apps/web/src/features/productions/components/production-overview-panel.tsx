"use client";

import { useQuery } from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import * as taskGateway from "@/features/tasks/api/tasks-gateway";
import { dateLabel } from "@/features/tasks/lib/tasks-types";

import {
  getProductionBudgetSummary,
  listProductionLocations,
} from "../api/productions-gateway";
import type { Production } from "../lib/production-types";

type TaskItem = Awaited<
  ReturnType<typeof taskGateway.listTasks>
>["items"][number];

function isOpen(task: TaskItem): boolean {
  return task.status !== "COMPLETED" && task.status !== "CANCELLED";
}

function isOverdue(task: TaskItem): boolean {
  return (
    task.dueAt !== null &&
    isOpen(task) &&
    new Date(task.dueAt).getTime() < Date.now()
  );
}

function isUpcoming(task: TaskItem): boolean {
  return (
    task.dueAt !== null &&
    isOpen(task) &&
    new Date(task.dueAt).getTime() >= Date.now()
  );
}

export function ProductionOverviewPanel({
  access,
  production,
  canReadBudget,
}: {
  access: CurrentAccess;
  production: Production;
  canReadBudget: boolean;
}) {
  const tasksQuery = useQuery({
    queryKey: ["tasks", access.userId, "by-workspace", production.workspaceId],
    queryFn: ({ signal }) =>
      taskGateway.listTasks(
        { workspaceId: production.workspaceId, pageSize: 100 },
        signal,
      ),
    retry: false,
  });
  const locationsQuery = useQuery({
    queryKey: ["production-locations", production.id],
    queryFn: ({ signal }) => listProductionLocations(production.id, signal),
    retry: false,
  });
  const budgetQuery = useQuery({
    queryKey: ["production-budget-summary", production.id],
    queryFn: ({ signal }) => getProductionBudgetSummary(production.id, signal),
    enabled: canReadBudget,
    retry: false,
  });

  const tasks = tasksQuery.data?.items ?? [];
  const overdue = tasks.filter(isOverdue);
  const blocked = tasks.filter((task) => task.status === "BLOCKED");
  const upcoming = tasks
    .filter(isUpcoming)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
    .slice(0, 3);
  const completed = tasks.filter((task) => task.status === "COMPLETED");
  const progress =
    tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  const locations = locationsQuery.data ?? [];
  const pendingLocations = locations.filter(
    (location) =>
      location.status !== "READY" && location.status !== "CONFIRMED",
  );

  const summary = budgetQuery.data;
  const planned = summary?.plannedAmount ? Number(summary.plannedAmount) : null;
  const approved = summary ? Number(summary.actualApproved) : null;
  const overBudget =
    planned !== null && approved !== null && approved > planned;

  const attention = [
    overdue.length > 0
      ? `${overdue.length} overdue schedule item${overdue.length === 1 ? "" : "s"}`
      : null,
    blocked.length > 0
      ? `${blocked.length} blocked item${blocked.length === 1 ? "" : "s"}`
      : null,
    pendingLocations.length > 0
      ? `${pendingLocations.length} location${pendingLocations.length === 1 ? "" : "s"} not yet confirmed`
      : null,
    overBudget ? "Over the planned budget" : null,
  ].filter((item): item is string => item !== null);

  // Readiness (quality-readiness, kept deliberately simple): a "quality
  // check" is a REVIEW-type schedule item - no separate checklist model, the
  // existing task vocabulary already covers it. Readiness combines that with
  // location arrangement and blockers, the two other signals this workspace
  // already tracks with real data.
  const qualityChecks = tasks.filter((task) => task.type === "REVIEW");
  const qualityChecksComplete = qualityChecks.filter(
    (task) => task.status === "COMPLETED",
  );
  const qualityChecksDone =
    qualityChecks.length === 0 ||
    qualityChecksComplete.length === qualityChecks.length;
  const locationsReady =
    locations.length === 0 || pendingLocations.length === 0;
  const noBlockers = blocked.length === 0;
  const withinBudget = !canReadBudget || !overBudget;
  const readinessChecks = [
    {
      label:
        qualityChecks.length > 0
          ? `Quality checks (${qualityChecksComplete.length}/${qualityChecks.length} complete)`
          : "Quality checks (none recorded yet)",
      done: qualityChecksDone,
    },
    {
      label:
        locations.length > 0
          ? `Locations confirmed (${locations.length - pendingLocations.length}/${locations.length})`
          : "Locations confirmed (none recorded yet)",
      done: locationsReady,
    },
    { label: "No blocked schedule items", done: noBlockers },
    ...(canReadBudget
      ? [{ label: "Within planned budget", done: withinBudget }]
      : []),
  ];
  const isReady = readinessChecks.every((check) => check.done);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-3">
        <div className="bg-muted/40 w-full shrink grow-0 basis-56 rounded-lg border p-3 @min-[40rem]:basis-64">
          <p className="text-muted-foreground text-xs">Schedule progress</p>
          <p className="text-lg font-semibold">
            {tasksQuery.isPending ? "…" : `${progress}%`}
          </p>
          <p className="text-muted-foreground text-xs">
            {completed.length} of {tasks.length} items complete
          </p>
        </div>
        <div className="bg-muted/40 w-full shrink grow-0 basis-56 rounded-lg border p-3 @min-[40rem]:basis-64">
          <p className="text-muted-foreground text-xs">Locations</p>
          <p className="text-lg font-semibold">
            {locationsQuery.isPending
              ? "…"
              : `${pendingLocations.length} pending`}
          </p>
          <p className="text-muted-foreground text-xs">
            of {locationsQuery.data?.length ?? 0} total
          </p>
        </div>
        {canReadBudget ? (
          <div className="bg-muted/40 w-full shrink grow-0 basis-56 rounded-lg border p-3 @min-[40rem]:basis-64">
            <p className="text-muted-foreground text-xs">Budget</p>
            <p className="text-lg font-semibold">
              {budgetQuery.isPending
                ? "…"
                : summary?.plannedAmount
                  ? `${summary.actualApproved} / ${summary.plannedAmount} ${summary.currency}`
                  : "Not set"}
            </p>
          </div>
        ) : null}
      </div>

      <div
        className={`rounded-lg border p-3 ${isReady ? "border-green-600/40 bg-green-600/10" : "bg-muted/40"}`}
      >
        <p
          className={`text-sm font-medium ${isReady ? "text-green-700 dark:text-green-400" : ""}`}
        >
          {isReady
            ? "Ready for production"
            : "Production readiness - not yet ready"}
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {readinessChecks.map((check) => (
            <li key={check.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={check.done ? "text-green-600" : "text-destructive"}
              >
                {check.done ? "✓" : "✕"}
              </span>
              <span>{check.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {attention.length > 0 ? (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-3">
          <p className="text-destructive text-sm font-medium">
            Needs attention
          </p>
          <ul className="mt-1 list-inside list-disc text-sm">
            {attention.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Nothing needs attention right now.
        </p>
      )}

      {upcoming.length > 0 ? (
        <div>
          <p className="mb-1 text-sm font-medium">Upcoming deadlines</p>
          <ul className="space-y-1 text-sm">
            {upcoming.map((task) => (
              <li key={task.id} className="flex justify-between gap-2">
                <span>{task.title}</span>
                <span className="text-muted-foreground">
                  {dateLabel(task.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
