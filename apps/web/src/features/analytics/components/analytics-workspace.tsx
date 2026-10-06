"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPTY_FILTERS,
  MEASURES,
  filterError,
  isPaged,
  needsPeriod,
  type AnalyticsFilters,
  type Measure,
  type Panels,
} from "../lib/analytics-presentation";
import { AnalyticsResults } from "./analytics-results";

export interface AnalyticsWorkspaceProps {
  allowed: Record<Measure, boolean>;
  panels?: Panels;
  scopeLabel: string;
  initialMeasure?: Measure;
  measure?: Measure;
  filters?: AnalyticsFilters;
  refreshing?: boolean;
  notice?: string;
  onApply?: (measure: Measure, filters: AnalyticsFilters) => void;
  onRetry?: (measure: Measure) => void;
  onPageChange?: (measure: Measure, page: number) => void;
  onMeasureChange?: (measure: Measure) => void;
}

export function AnalyticsWorkspace({
  allowed,
  panels = {},
  scopeLabel,
  initialMeasure,
  measure: controlledMeasure,
  filters = EMPTY_FILTERS,
  refreshing = false,
  notice,
  onApply,
  onRetry,
  onPageChange,
  onMeasureChange,
}: AnalyticsWorkspaceProps) {
  const id = useId();
  const choices = (Object.keys(MEASURES) as Measure[]).filter(
    (key) => allowed[key],
  );
  const [selected, setSelected] = useState<Measure>(
    initialMeasure ?? choices[0] ?? "tasks",
  );
  const [draft, setDraft] = useState(filters);
  // Permission loss always takes precedence over cached response data.
  const current = controlledMeasure ?? selected;
  const measure = allowed[current] ? current : choices[0];
  if (!measure)
    return (
      <div role="alert" className="space-y-2 rounded-xl border p-5">
        <h2 className="font-semibold">Analytics access required</h2>
        <p>
          You do not have access to this area. Employee, dashboard, and report
          access do not grant management analytics.
        </p>
        <Link href="/" className="underline underline-offset-4">
          Back to home
        </Link>
      </div>
    );
  const panel = panels[measure] ?? { state: "unavailable" as const };
  const error = filterError(measure, draft);
  const ready = panel.state === "ready";
  const page = ready && "page" in panel.data ? panel.data : null;
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  const partial =
    choices.some((key) => panels[key]?.state === "error") &&
    choices.some((key) => panels[key]?.state === "ready");
  const controlsEnabled =
    !refreshing && !["denied", "unavailable", "loading"].includes(panel.state);
  const update = (patch: Partial<AnalyticsFilters>) =>
    setDraft((value) => ({ ...value, ...patch }));
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Work delivery analytics</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Scope: {scopeLabel}. Each measure requires its own scoped grant.
          </p>
        </div>
        <div className="space-y-1">
          <Button variant="outline" disabled aria-describedby={`${id}-export`}>
            Export analytics
          </Button>
          <p
            id={`${id}-export`}
            className="text-muted-foreground max-w-64 text-xs"
          >
            Analytics export is not supported in this delivery slice.
          </p>
        </div>
      </div>
      {partial ? (
        <p role="status" className="rounded-lg border p-3">
          Some measures are unavailable. Successful measures remain readable;
          failed measures are not zero results.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border p-3">
          {notice}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`${id}-measure`}>Analytics measure</Label>
        <select
          id={`${id}-measure`}
          value={measure}
          className="border-input bg-background focus-visible:outline-ring min-h-9 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2 sm:max-w-sm"
          onChange={(event) => {
            setSelected(event.target.value as Measure);
            setDraft(filters);
            onMeasureChange?.(event.target.value as Measure);
          }}
        >
          {choices.map((key) => (
            <option key={key} value={key}>
              {MEASURES[key]}
            </option>
          ))}
        </select>
      </div>
      <form
        aria-label={`${MEASURES[measure]} filters`}
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!error && controlsEnabled) onApply?.(measure, draft);
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
                aria-invalid={!!error}
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
                aria-invalid={!!error}
                onChange={(event) =>
                  update({ toExclusive: event.target.value })
                }
              />
            </div>
          </>
        ) : null}
        {measure !== "tasks" && measure !== "monthly" ? (
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${id}-subject`}>
              {measure === "promotion"
                ? "Promotion campaign ID (required)"
                : "Subject ID (optional)"}
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
        {isPaged(measure) ? (
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
          <Button
            type="submit"
            disabled={!controlsEnabled || !!error || !onApply}
          >
            Apply filters
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!controlsEnabled || !onRetry}
            onClick={() => onRetry?.(measure)}
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
          role={controlsEnabled && error ? "alert" : undefined}
          className="text-destructive text-sm sm:col-span-2 lg:col-span-4"
        >
          {controlsEnabled ? error : null}
        </p>
      </form>
      <section
        aria-label={MEASURES[measure]}
        aria-busy={panel.state === "loading" || refreshing}
        className="min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
      >
        <h3 className="text-lg font-semibold">{MEASURES[measure]}</h3>
        {refreshing ? (
          <p role="status">
            Refreshing this measure; displayed data retains its previous
            timestamp.
          </p>
        ) : null}
        {panel.state === "loading" ? (
          <p role="status">Loading {MEASURES[measure].toLowerCase()}…</p>
        ) : null}
        {panel.state === "input" ? (
          <p role="status">
            {panel.message ?? "Choose valid filters to load this measure."}
          </p>
        ) : null}
        {panel.state === "unavailable" ? (
          <p role="status">
            Analytics data is not connected yet. Live API integration is
            delivered in EVE-175; no sample results are shown.
          </p>
        ) : null}
        {panel.state === "denied" ? (
          <p role="alert">
            You do not have access to this measure. Ask an administrator to
            check the scoped analytics grant.
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
              disabled={!onRetry || refreshing}
              onClick={() => onRetry?.(measure)}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {ready ? (
          <AnalyticsResults measure={measure} data={panel.data} />
        ) : null}
        {page ? (
          <nav
            aria-label={`${MEASURES[measure]} pagination`}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <Button
              variant="outline"
              disabled={page.page <= 1 || !onPageChange || refreshing}
              onClick={() => onPageChange?.(measure, page.page - 1)}
            >
              Previous page
            </Button>
            <p className="text-sm">
              Page {page.page} of {pages} · {page.total} authorized subjects
            </p>
            <Button
              variant="outline"
              disabled={
                page.page >= pages ||
                page.page * page.pageSize > 10_000 ||
                !onPageChange ||
                refreshing
              }
              onClick={() => onPageChange?.(measure, page.page + 1)}
            >
              Next page
            </Button>
            {page.page < pages && page.page * page.pageSize > 10_000 ? (
              <p className="text-muted-foreground w-full text-sm">
                Paging limit reached. Narrow the subject filter instead.
              </p>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
