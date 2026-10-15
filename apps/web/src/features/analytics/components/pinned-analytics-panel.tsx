"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  AnalyticsRequestError,
  fetchAnalytics,
} from "../api/analytics-gateway";
import {
  filterError,
  isPaged,
  needsPeriod,
  type AnalyticsFilters,
  type Responses,
} from "../lib/analytics-presentation";
import type { AnalyticsSelection } from "../lib/analytics-url";
import { analyticsIdentity } from "./analytics-manager";
import { AnalyticsResults } from "./analytics-results";
import {
  CategoryBarChart,
  CompletionDonut,
  MonthlyLineChart,
  monthlySeries,
  progressRows,
} from "./analytics-chart-kit";

export type PinnedMeasure = "tasks" | "departments" | "monthly";

const TITLES: Record<PinnedMeasure, string> = {
  tasks: "Task completion rate",
  departments: "Department performance",
  monthly: "Monthly activity",
};

/** One of the three analytics measures the user asked to always show on the
 * Analytics page, stacked vertically, independent of whichever measure is
 * selected in the dropdown below. Reuses the same `fetchAnalytics`/
 * `AnalyticsResults`/chart-kit building blocks the single-measure selector
 * uses - this is a parallel always-visible composition, not a second data
 * source or a duplicated endpoint. */
export function PinnedAnalyticsPanel({
  measure,
  access,
  epoch,
  defaults,
  onAuthorizationError,
}: {
  measure: PinnedMeasure;
  access: CurrentAccess;
  epoch: number;
  defaults: AnalyticsFilters;
  onAuthorizationError: (error: AnalyticsRequestError) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<AnalyticsFilters>(defaults);
  const [applied, setApplied] = useState<AnalyticsFilters>(defaults);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  // Two distinct validity checks, same split as `AnalyticsManager`/
  // `AnalyticsWorkspace`: `error` gates the applied query (like the URL
  // selection there), `draftError` only drives the form's own live inline
  // feedback and never affects which data is fetched until Apply is
  // clicked.
  const error = filterError(measure, applied);
  const draftError = filterError(measure, draft);
  const selection: AnalyticsSelection = { measure, filters: applied, page };
  const identity = analyticsIdentity(access, epoch);
  const queryKey = [
    ...identity,
    measure,
    JSON.stringify({ filters: applied, page }),
  ] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchAnalytics(selection, signal),
    enabled: !error,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });
  if (
    query.error instanceof AnalyticsRequestError &&
    [401, 403].includes(query.error.status)
  )
    onAuthorizationError(query.error);

  const panel = error
    ? ({ state: "input" as const, message: error })
    : query.isError
      ? {
          state: "error" as const,
          message:
            query.error instanceof AnalyticsRequestError
              ? query.error.message
              : "The analytics service could not be reached. Try again.",
        }
      : query.isPending
        ? { state: "loading" as const }
        : { state: "ready" as const, data: query.data };
  const refreshing = query.isFetching && !!query.data && !query.isError;
  const controlsEnabled = !refreshing && panel.state !== "loading";
  const paged = isPaged(measure);
  const total =
    panel.state === "ready" && "page" in panel.data ? panel.data.total : 0;
  const pageSize = applied.pageSize;
  const pages = paged ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  const update = (patch: Partial<AnalyticsFilters>) =>
    setDraft((prev) => ({ ...prev, ...patch }));
  const apply = () => {
    setNotice(null);
    setApplied(draft);
    setPage(1);
  };
  const retry = () => {
    if (refreshing) return;
    setNotice(null);
    void query.refetch().then((result) => {
      if (result.isSuccess)
        setNotice(`${TITLES[measure]} refreshed from authoritative data.`);
    });
  };

  let chart = null;
  if (panel.state === "ready") {
    if (measure === "tasks" && "counts" in panel.data) {
      const { completed, total: eligible, percent } = panel.data.counts;
      chart = (
        <CompletionDonut
          completed={completed}
          total={eligible}
          percent={percent}
        />
      );
    } else if (measure === "departments" && "items" in panel.data) {
      const departments = panel.data as Responses["departments"];
      chart = (
        <CategoryBarChart
          title="Department performance comparison"
          data={progressRows(departments.items)}
          maxValue={100}
          size="spacious"
        />
      );
    } else if (measure === "monthly" && "items" in panel.data) {
      const monthly = panel.data as Responses["monthly"];
      chart = monthly.items.length ? (
        <div className="grid gap-5 @min-[56rem]:grid-cols-2">
          {monthlySeries.map(([key, label], index) => (
            <MonthlyLineChart
              key={key}
              data={monthly}
              seriesKey={key}
              seriesLabel={label}
              colorIndex={index}
            />
          ))}
        </div>
      ) : null;
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <h3 className="text-lg font-semibold">{TITLES[measure]}</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        {notice ? (
          <p role="status" className="rounded-lg border p-3 text-sm">
            {notice}
          </p>
        ) : null}
        <form
          aria-label={`${TITLES[measure]} filters`}
          className="bg-muted/30 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftError && controlsEnabled) apply();
          }}
        >
          {needsPeriod(measure) ? (
            <>
              <div className="space-y-1">
                <Label htmlFor={`${id}-from`}>
                  {measure === "monthly"
                    ? "Activity month start (UTC)"
                    : "Creation period start (UTC)"}
                </Label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  value={draft.from}
                  disabled={!controlsEnabled}
                  aria-describedby={`${id}-dates ${id}-error`}
                  onChange={(event) => update({ from: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-to`}>End (exclusive, UTC)</Label>
                <Input
                  id={`${id}-to`}
                  type="date"
                  value={draft.toExclusive}
                  disabled={!controlsEnabled}
                  aria-describedby={`${id}-dates ${id}-error`}
                  onChange={(event) =>
                    update({ toExclusive: event.target.value })
                  }
                />
              </div>
            </>
          ) : null}
          {measure === "departments" ? (
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${id}-subject`}>
                Department ID (optional)
              </Label>
              <Input
                id={`${id}-subject`}
                value={draft.subjectId}
                disabled={!controlsEnabled}
                aria-describedby={`${id}-error`}
                onChange={(event) =>
                  update({ subjectId: event.target.value.trim() })
                }
              />
            </div>
          ) : null}
          {paged ? (
            <div className="space-y-1">
              <Label htmlFor={`${id}-size`}>Rows per page</Label>
              <select
                id={`${id}-size`}
                value={draft.pageSize}
                disabled={!controlsEnabled}
                className="border-input bg-background focus-visible:outline-ring min-h-9 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
                onChange={(event) =>
                  update({ pageSize: Number(event.target.value) })
                }
              >
                {[25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit" disabled={!controlsEnabled || !!draftError}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={panel.state === "loading"}
              aria-disabled={refreshing}
              className="aria-disabled:opacity-50"
              onClick={retry}
            >
              Refresh measure
            </Button>
          </div>
          {needsPeriod(measure) ? (
            <p
              id={`${id}-dates`}
              className="text-muted-foreground text-sm sm:col-span-2 lg:col-span-4"
            >
              {measure === "monthly"
                ? "First-of-month UTC boundaries, 1–12 months. Dates select activity buckets, not a task creation cohort."
                : "Creation cohort, at most 366 days. The end date is not included."}
            </p>
          ) : null}
          <p
            id={`${id}-error`}
            role={controlsEnabled && draftError ? "alert" : undefined}
            className="text-destructive text-sm sm:col-span-2 lg:col-span-4"
          >
            {controlsEnabled ? draftError : null}
          </p>
        </form>
        {refreshing ? (
          <p role="status" className="text-sm">
            Refreshing this measure; displayed data retains its previous
            timestamp.
          </p>
        ) : null}
        {panel.state === "loading" ? (
          <p role="status">Loading {TITLES[measure].toLowerCase()}…</p>
        ) : null}
        {panel.state === "input" ? (
          <p role="status">
            {panel.message ?? "Choose valid filters to load this measure."}
          </p>
        ) : null}
        {panel.state === "error" ? (
          <div role="alert" className="space-y-3">
            <p>
              {panel.message ??
                "This measure could not load. Unavailable data is not zero activity."}
            </p>
            <Button
              variant="outline"
              aria-disabled={refreshing}
              className="aria-disabled:opacity-50"
              onClick={retry}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {panel.state === "ready" ? (
          <div className="space-y-6">
            {chart}
            <AnalyticsResults
              measure={measure}
              data={panel.data}
              hideCompletionMeter={measure === "tasks"}
            />
          </div>
        ) : null}
        {paged && panel.state === "ready" ? (
          <nav
            aria-label={`${TITLES[measure]} pagination`}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <Button
              variant="outline"
              disabled={page <= 1 || refreshing}
              onClick={() => setPage((prev) => prev - 1)}
            >
              Previous page
            </Button>
            <p className="text-sm">
              Page {page} of {pages} · {total} authorized subjects
            </p>
            <Button
              variant="outline"
              disabled={
                page >= pages || page * pageSize > 10_000 || refreshing
              }
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next page
            </Button>
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}
