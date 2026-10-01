"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  NARRATIVE_FIELDS,
  REPORT_STATUSES,
  REPORT_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
  periodLabel,
  statusVariant,
  type CreateReport,
  type Report,
  type ReportDetail,
  type ReportList,
  type ReportStatus,
  type ReportType,
  type ReviewOutcome,
} from "../lib/report-presentation";
import { ReportDraftForm, type WorkspaceChoice } from "./report-draft-form";

export interface ReportFilters {
  type: ReportType | null;
  status: ReportStatus | null;
  periodFrom: string;
  periodTo: string;
}

export interface ReportsWorkspaceProps {
  state: "unavailable" | "loading" | "error" | "denied" | "ready";
  audience: "employee" | "management";
  currentUserId: string;
  list?: ReportList | undefined;
  selectedId?: string | null;
  detail?: ReportDetail | null;
  detailState?: "loading" | "error" | "ready";
  filters?: ReportFilters;
  workspaces?: readonly WorkspaceChoice[];
  authorNames?: Readonly<Record<string, string>>;
  departmentNames?: Readonly<Record<string, string>>;
  canCreate?: boolean;
  canReview?: boolean;
  busy?: boolean;
  notice?: { kind: "success" | "error"; message: string } | null;
  onRetry?: () => void;
  onFiltersChange?: (filters: ReportFilters) => void;
  onPageChange?: (page: number) => void;
  onSelect?: (id: string | null) => void;
  onSaveDraft?: (values: CreateReport, reportId?: string) => void;
  onSubmit?: (id: string) => void;
  onReview?: (id: string, outcome: ReviewOutcome, note: string) => void;
  onExport?: (id: string) => void;
}

const EMPTY_FILTERS: ReportFilters = {
  type: null,
  status: null,
  periodFrom: "",
  periodTo: "",
};

function metric(label: string, value: number | null) {
  if (value === null) return null;
  return (
    <div key={label} className="bg-muted/40 rounded-lg border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ReportDetailPanel({
  report,
  currentUserId,
  canReview,
  busy,
  onEdit,
  onSubmit,
  onReview,
  onExport,
  onClose,
}: {
  report: ReportDetail;
  currentUserId: string;
  canReview: boolean;
  busy: boolean;
  onEdit?: (() => void) | undefined;
  onSubmit?: (() => void) | undefined;
  onReview?: ((outcome: ReviewOutcome, note: string) => void) | undefined;
  onExport?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}) {
  const [reviewNote, setReviewNote] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isAuthor = report.authorId === currentUserId;
  const editable =
    isAuthor &&
    (report.status === "DRAFT" || report.status === "CHANGES_REQUESTED");
  const submissionComplete = NARRATIVE_FIELDS[report.type].every(({ key }) => {
    const value = report[key];
    return typeof value === "string" && value.trim().length > 0;
  });

  useEffect(() => headingRef.current?.focus(), [report.id]);

  return (
    <section
      aria-labelledby="report-detail-title"
      className="space-y-5 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            {TYPE_LABELS[report.type]} · {periodLabel(report)}
          </p>
          <h2
            ref={headingRef}
            id="report-detail-title"
            tabIndex={-1}
            className="mt-1 text-lg font-semibold break-words"
          >
            {report.title}
          </h2>
          <Badge variant={statusVariant(report.status)} className="mt-2">
            {STATUS_LABELS[report.status]}
          </Badge>
        </div>
        {onClose ? (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close detail
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {editable && onEdit ? (
          <Button variant="outline" disabled={busy} onClick={onEdit}>
            Edit draft
          </Button>
        ) : null}
        {isAuthor && report.status === "DRAFT" && onSubmit ? (
          <Button disabled={busy || !submissionComplete} onClick={onSubmit}>
            Submit for review
          </Button>
        ) : null}
        {onExport ? (
          <Button variant="outline" disabled={busy} onClick={onExport}>
            Export JSON
          </Button>
        ) : null}
      </div>
      {isAuthor && report.status === "DRAFT" && !submissionComplete ? (
        <p className="text-muted-foreground text-sm">
          Complete every report section before submitting. You can still save an
          incomplete draft.
        </p>
      ) : null}

      <section aria-labelledby="report-facts-title" className="space-y-2">
        <h3 id="report-facts-title" className="font-medium">
          Work facts
        </h3>
        <p className="text-muted-foreground text-xs">
          Completed tasks are for this UTC period. Open tasks and projects are
          current as of {report.facts.asOf}.
        </p>
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {metric(
            "Tasks completed in period",
            report.facts.completedTasksInPeriod,
          )}
          {metric("Tasks in progress now", report.facts.inProgressTasksNow)}
          {metric("Tasks pending now", report.facts.pendingTasksNow)}
          {metric("Tasks overdue now", report.facts.overdueTasksNow)}
          {metric("Projects total now", report.facts.totalProjectsNow)}
          {metric("Projects completed now", report.facts.completedProjectsNow)}
          {metric("Projects active now", report.facts.activeProjectsNow)}
        </dl>
      </section>

      <section aria-labelledby="report-narrative-title" className="space-y-3">
        <h3 id="report-narrative-title" className="font-medium">
          Report sections
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {NARRATIVE_FIELDS[report.type].map(({ key, label }) => (
            <div key={key} className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-1 text-sm whitespace-pre-wrap">
                {report[key] || (
                  <span className="text-muted-foreground">Not provided</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="report-workspaces-title">
        <h3 id="report-workspaces-title" className="font-medium">
          Related workspaces
        </h3>
        {report.workspaceIds.length ? (
          <ul className="mt-2 list-inside list-disc text-sm">
            {report.workspaceIds.map((id) => (
              <li key={id} className="break-all">
                {id}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">
            No workspaces linked.
          </p>
        )}
      </section>

      <section aria-labelledby="report-reviews-title">
        <h3 id="report-reviews-title" className="font-medium">
          Review history
        </h3>
        {report.reviews.length ? (
          <ol className="mt-2 space-y-2">
            {report.reviews.map((review) => (
              <li key={review.id} className="rounded-lg border p-3 text-sm">
                <span className="font-medium">
                  {review.outcome === "REVIEWED"
                    ? "Reviewed"
                    : "Changes requested"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {review.reviewedAt}
                </span>
                {review.note ? (
                  <p className="mt-1 whitespace-pre-wrap">{review.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">No reviews yet.</p>
        )}
      </section>

      {canReview && !isAuthor && report.status === "SUBMITTED" && onReview ? (
        <section
          aria-labelledby="review-action-title"
          className="space-y-2 border-t pt-4"
        >
          <h3 id="review-action-title" className="font-medium">
            Review this report
          </h3>
          <Label htmlFor="report-review-note">Review note (optional)</Label>
          <textarea
            id="report-review-note"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            maxLength={5000}
            disabled={busy}
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-3 text-sm focus-visible:ring-2"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => onReview("REVIEWED", reviewNote)}
            >
              Mark reviewed
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onReview("CHANGES_REQUESTED", reviewNote)}
            >
              Request changes
            </Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ReportRows({
  items,
  currentUserId,
  audience,
  authorNames,
  departmentNames,
  onSelect,
}: {
  items: readonly Report[];
  currentUserId: string;
  audience: ReportsWorkspaceProps["audience"];
  authorNames: Readonly<Record<string, string>>;
  departmentNames: Readonly<Record<string, string>>;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const owner = (report: Report) =>
    report.authorId === currentUserId
      ? "You"
      : (authorNames[report.authorId] ?? `User ${report.authorId}`);
  const department = (report: Report) =>
    report.departmentId
      ? (departmentNames[report.departmentId] ??
        `Department ${report.departmentId}`)
      : "No department";

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Report
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Period (UTC)
              </th>
              {audience === "management" ? (
                <th scope="col" className="px-4 py-3 font-medium">
                  Owner / department
                </th>
              ) : null}
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((report) => (
              <tr key={report.id}>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  <button
                    type="button"
                    className="rounded text-left underline-offset-4 hover:underline focus-visible:outline-2"
                    onClick={() => onSelect?.(report.id)}
                  >
                    {report.title}
                  </button>
                  <span className="text-muted-foreground block text-xs font-normal">
                    {TYPE_LABELS[report.type]}
                  </span>
                </th>
                <td className="px-4 py-3 tabular-nums">
                  {periodLabel(report)}
                </td>
                {audience === "management" ? (
                  <td className="px-4 py-3">
                    {owner(report)}
                    <span className="text-muted-foreground block text-xs">
                      {department(report)}
                    </span>
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(report.status)}>
                    {STATUS_LABELS[report.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {items.map((report) => (
          <li key={report.id} className="rounded-xl border p-4">
            <button
              type="button"
              className="w-full rounded text-left focus-visible:outline-2"
              onClick={() => onSelect?.(report.id)}
            >
              <span className="font-medium">{report.title}</span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {TYPE_LABELS[report.type]} · {periodLabel(report)}
              </span>
              {audience === "management" ? (
                <span className="text-muted-foreground mt-1 block text-sm">
                  {owner(report)} · {department(report)}
                </span>
              ) : null}
              <Badge variant={statusVariant(report.status)} className="mt-2">
                {STATUS_LABELS[report.status]}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ReportsWorkspace({
  state,
  audience,
  currentUserId,
  list,
  selectedId,
  detail,
  detailState = "ready",
  filters = EMPTY_FILTERS,
  workspaces = [],
  authorNames = {},
  departmentNames = {},
  canCreate = false,
  canReview = false,
  busy = false,
  notice,
  onRetry,
  onFiltersChange,
  onPageChange,
  onSelect,
  onSaveDraft,
  onSubmit,
  onReview,
  onExport,
}: ReportsWorkspaceProps) {
  const [editing, setEditing] = useState<ReportDetail | "new" | null>(null);
  const [draftFilters, setDraftFilters] = useState(filters);
  const incompleteRange =
    Boolean(draftFilters.periodFrom) !== Boolean(draftFilters.periodTo);
  const reversedRange = Boolean(
    draftFilters.periodFrom &&
    draftFilters.periodTo &&
    draftFilters.periodFrom > draftFilters.periodTo,
  );
  const pageCount = list
    ? Math.max(1, Math.ceil(list.total / list.pageSize))
    : 1;

  if (state === "denied")
    return <p role="alert">You do not have access to reports.</p>;
  if (state === "loading") return <p role="status">Loading reports…</p>;
  if (state === "error")
    return (
      <div role="alert">
        <p>We could not load reports.</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  if (state === "unavailable")
    return (
      <div role="status" className="rounded-xl border border-dashed p-6">
        <h2 className="font-medium">Report data is not connected yet</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The reporting interface is being prepared. No report data or actions
          are available in this view yet.
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className="rounded-lg border p-3 text-sm"
        >
          {notice.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {audience === "management" ? "Team reports" : "My reports"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {list
              ? `${list.total} report${list.total === 1 ? "" : "s"}`
              : "Report list unavailable"}
          </p>
        </div>
        {canCreate && onSaveDraft ? (
          <Button onClick={() => setEditing("new")}>New report</Button>
        ) : null}
      </div>

      <section
        aria-label="Report filters"
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
      >
        <div className="space-y-1">
          <Label htmlFor="report-filter-type">Type</Label>
          <select
            id="report-filter-type"
            value={draftFilters.type ?? ""}
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                type: event.target.value
                  ? (event.target.value as ReportType)
                  : null,
              })
            }
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {REPORT_TYPES.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-filter-status">Status</Label>
          <select
            id="report-filter-status"
            value={draftFilters.status ?? ""}
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                status: event.target.value
                  ? (event.target.value as ReportStatus)
                  : null,
              })
            }
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {REPORT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-filter-from">Period from (UTC)</Label>
          <Input
            id="report-filter-from"
            type="date"
            value={draftFilters.periodFrom}
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                periodFrom: event.target.value,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="report-filter-to">Period to (UTC)</Label>
          <Input
            id="report-filter-to"
            type="date"
            value={draftFilters.periodTo}
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, periodTo: event.target.value })
            }
          />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={incompleteRange || reversedRange || !onFiltersChange}
            onClick={() => onFiltersChange?.(draftFilters)}
          >
            Apply
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDraftFilters(EMPTY_FILTERS);
              onFiltersChange?.(EMPTY_FILTERS);
            }}
          >
            Clear
          </Button>
        </div>
        {incompleteRange || reversedRange ? (
          <p
            role="alert"
            className="text-destructive text-sm sm:col-span-2 lg:col-span-5"
          >
            {incompleteRange
              ? "Enter both period dates or leave both blank."
              : "Period end must be on or after period start."}
          </p>
        ) : null}
      </section>

      {!list ? (
        <div role="alert" className="rounded-xl border p-4">
          The report list is unavailable.{" "}
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : list.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No reports to show</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Adjust the filters, or create a report if you have permission.
          </p>
        </div>
      ) : (
        <ReportRows
          items={list.items}
          currentUserId={currentUserId}
          audience={audience}
          authorNames={authorNames}
          departmentNames={departmentNames}
          onSelect={onSelect}
        />
      )}

      {list && pageCount > 1 ? (
        <nav
          aria-label="Reports pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            variant="outline"
            disabled={list.page <= 1}
            onClick={() => onPageChange?.(list.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {list.page} of {pageCount}
          </span>
          <Button
            variant="outline"
            disabled={list.page >= pageCount}
            onClick={() => onPageChange?.(list.page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}

      {selectedId ? (
        detailState === "loading" ? (
          <p role="status">Loading report detail…</p>
        ) : detailState === "error" || !detail ? (
          <div role="alert">
            <p>Report detail is unavailable.</p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <ReportDetailPanel
            key={detail.id}
            report={detail}
            currentUserId={currentUserId}
            canReview={canReview}
            busy={busy}
            onClose={() => onSelect?.(null)}
            onEdit={
              canCreate && onSaveDraft ? () => setEditing(detail) : undefined
            }
            onSubmit={onSubmit ? () => onSubmit(detail.id) : undefined}
            onReview={
              onReview
                ? (outcome, note) => onReview(detail.id, outcome, note)
                : undefined
            }
            onExport={onExport ? () => onExport(detail.id) : undefined}
          />
        )
      ) : null}

      {editing && onSaveDraft ? (
        <section
          aria-labelledby="draft-title"
          className="rounded-xl border p-4 sm:p-6"
        >
          <h2 id="draft-title" className="mb-4 text-lg font-semibold">
            {editing === "new" ? "New report draft" : "Edit report draft"}
          </h2>
          <ReportDraftForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            workspaces={workspaces}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(values) =>
              onSaveDraft(values, editing === "new" ? undefined : editing.id)
            }
          />
        </section>
      ) : null}
    </div>
  );
}
