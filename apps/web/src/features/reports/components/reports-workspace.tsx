"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  FilePlus2,
  SlidersHorizontal,
} from "lucide-react";

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
  type ReportFilters,
  type ReportList,
  type ReportStatus,
  type ReportType,
  type ReviewOutcome,
} from "../lib/report-presentation";
import { ReportDraftForm, type WorkspaceChoice } from "./report-draft-form";
import { ReportActionButton } from "./report-action-button";
import styles from "./reports.module.css";

export interface ReportsWorkspaceProps {
  state: "unavailable" | "loading" | "error" | "denied" | "ready";
  audience: "employee" | "management";
  currentUserId: string;
  list?: ReportList | undefined;
  selectedId?: string | null;
  detail?: ReportDetail | null | undefined;
  detailState?: "loading" | "error" | "ready";
  filters?: ReportFilters;
  workspaces?: readonly WorkspaceChoice[];
  workspaceWarning?: string | null | undefined;
  authorNames?: Readonly<Record<string, string>>;
  departmentNames?: Readonly<Record<string, string>>;
  canCreate?: boolean;
  canReview?: boolean;
  busy?: boolean;
  notice?: { kind: "success" | "error"; message: string } | null;
  errorMessage?: string | undefined;
  onRetry?: () => void;
  onFiltersChange?: (filters: ReportFilters) => void;
  onPageChange?: (page: number) => void;
  onSelect?: (id: string | null) => void;
  onSaveDraft?:
    | ((values: CreateReport, reportId?: string) => boolean | Promise<boolean>)
    | undefined;
  onSubmit?: ((id: string) => void) | undefined;
  onReview?:
    ((id: string, outcome: ReviewOutcome, note: string) => void) | undefined;
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
    <div key={label} className="bg-muted rounded-xl border p-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-primary mt-2 text-2xl font-semibold tabular-nums">
        {value}
      </dd>
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
  authorName,
  departmentName,
  focusVersion,
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
  authorName: string;
  departmentName: string;
  focusVersion: number;
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

  useEffect(
    () => headingRef.current?.focus(),
    [report.id, report.status, focusVersion],
  );

  return (
    <section
      aria-labelledby="report-detail-title"
      className={`${styles.panel} space-y-6 p-4 sm:p-6`}
      aria-busy={busy}
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
            className="mt-2 text-2xl font-semibold tracking-tight break-words"
          >
            {report.title}
          </h2>
          <Badge variant={statusVariant(report.status)} className="mt-2">
            {STATUS_LABELS[report.status]}
          </Badge>
          <p className="text-muted-foreground mt-3 text-sm">
            {authorName} · {departmentName}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {report.status === "DRAFT"
              ? "Save your progress, then submit when every section is complete."
              : report.status === "SUBMITTED"
                ? "Submitted for management review."
                : report.status === "CHANGES_REQUESTED"
                  ? "Read the review notes and update your draft."
                  : "Review complete. Your report and review history are available below."}
          </p>
        </div>
        {onClose ? (
          <ReportActionButton
            variant="outline"
            size="sm"
            busy={busy}
            onClick={onClose}
          >
            Close detail
          </ReportActionButton>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {editable && onEdit ? (
          <ReportActionButton variant="outline" busy={busy} onClick={onEdit}>
            Edit draft
          </ReportActionButton>
        ) : null}
        {isAuthor && report.status === "DRAFT" && onSubmit ? (
          <ReportActionButton
            busy={busy}
            disabled={!submissionComplete}
            onClick={onSubmit}
          >
            Submit for review
          </ReportActionButton>
        ) : null}
        {onExport ? (
          <ReportActionButton variant="outline" busy={busy} onClick={onExport}>
            Export JSON
          </ReportActionButton>
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
            <div
              key={key}
              className={`${styles.narrative} min-w-0 rounded-xl p-4`}
            >
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
          className="bg-secondary/40 space-y-3 rounded-xl border p-4 sm:p-5"
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
            readOnly={busy}
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-3 text-sm focus-visible:ring-2"
          />
          <div className="flex flex-wrap gap-2">
            <ReportActionButton
              busy={busy}
              onClick={() => onReview("REVIEWED", reviewNote)}
            >
              Mark reviewed
            </ReportActionButton>
            <ReportActionButton
              variant="outline"
              busy={busy}
              onClick={() => onReview("CHANGES_REQUESTED", reviewNote)}
            >
              Request changes
            </ReportActionButton>
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
  busy,
}: {
  items: readonly Report[];
  currentUserId: string;
  audience: ReportsWorkspaceProps["audience"];
  authorNames: Readonly<Record<string, string>>;
  departmentNames: Readonly<Record<string, string>>;
  onSelect?: ((id: string) => void) | undefined;
  busy: boolean;
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
      <div className={`${styles.panel} hidden overflow-x-auto md:block`}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Reports on this page</caption>
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
              <tr key={report.id} className={styles.row}>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  <button
                    type="button"
                    className="rounded text-left underline-offset-4 hover:underline focus-visible:outline-2"
                    aria-disabled={busy || undefined}
                    onClick={() => {
                      if (!busy) onSelect?.(report.id);
                    }}
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
          <li key={report.id} className={`${styles.panel} p-4`}>
            <button
              type="button"
              className="w-full rounded text-left focus-visible:outline-2"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onSelect?.(report.id);
              }}
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
  workspaceWarning,
  authorNames = {},
  departmentNames = {},
  canCreate = false,
  canReview = false,
  busy = false,
  notice,
  errorMessage,
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
  const [focusVersion, setFocusVersion] = useState(0);
  const newReportRef = useRef<HTMLButtonElement>(null);
  function closeEditor() {
    setEditing(null);
    setFocusVersion((version) => version + 1);
    if (!selectedId) newReportRef.current?.focus();
  }
  const [draftFilters, setDraftFilters] = useState(filters);
  const incompleteRange =
    Boolean(draftFilters.periodFrom) !== Boolean(draftFilters.periodTo);
  const reversedRange = Boolean(
    draftFilters.periodFrom &&
    draftFilters.periodTo &&
    draftFilters.periodFrom > draftFilters.periodTo,
  );
  const overlongRange = Boolean(
    draftFilters.periodFrom &&
    draftFilters.periodTo &&
    (Date.parse(`${draftFilters.periodTo}T00:00:00Z`) -
      Date.parse(`${draftFilters.periodFrom}T00:00:00Z`)) /
      86_400_000 >
      366,
  );
  const pageCount = list
    ? Math.max(1, Math.ceil(list.total / list.pageSize))
    : 1;

  if (state === "denied")
    return <p role="alert">You do not have access to reports.</p>;
  if (state === "loading")
    return (
      <p role="status" className={`${styles.panel} p-6`}>
        Loading reports…
      </p>
    );
  if (state === "error")
    return (
      <div role="alert" className={`${styles.panel} space-y-3 p-6`}>
        <p>{errorMessage ?? "We could not load reports."}</p>
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
    <div className={`${styles.workspace} space-y-6`}>
      {notice ? (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-xl border p-4 text-sm ${notice.kind === "error" ? "border-destructive/40 bg-destructive/5" : "bg-success-background text-success"}`}
        >
          {notice.message}
        </p>
      ) : null}
      <div
        className={`${styles.header} flex flex-wrap items-center justify-between gap-4`}
      >
        <div>
          <p className="text-primary mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            <ClipboardList aria-hidden="true" className="size-4" /> Work
            reporting
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {audience === "management" ? "Team reports" : "My reports"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {list
              ? `${list.total} report${list.total === 1 ? "" : "s"}`
              : "Report list unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRetry ? (
            <ReportActionButton variant="outline" busy={busy} onClick={onRetry}>
              Refresh reports
            </ReportActionButton>
          ) : null}
          {canCreate && onSaveDraft ? (
            <ReportActionButton
              ref={newReportRef}
              busy={busy || editing !== null}
              onClick={() => setEditing("new")}
            >
              <FilePlus2 aria-hidden="true" />
              New report
            </ReportActionButton>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Reporting periods">
        {REPORT_TYPES.map((type) => (
          <div
            key={type}
            className={`${styles.panel} flex items-start gap-3 p-4`}
          >
            <span className="bg-secondary text-secondary-foreground rounded-lg p-2">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-semibold">{TYPE_LABELS[type]}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {type === "DAILY"
                  ? "One day of progress and next steps."
                  : type === "WEEKLY"
                    ? "Seven days of achievements and challenges."
                    : "A calendar month of work and performance."}
              </p>
            </div>
          </div>
        ))}
      </div>

      <section
        aria-label="Report filters"
        className={`${styles.panel} grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 lg:items-end`}
      >
        <h3 className="flex items-center gap-2 font-semibold sm:col-span-2 lg:col-span-3">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Find reports
        </h3>
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
        {audience === "management" && Object.keys(authorNames).length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="report-filter-author">Author</Label>
            <select
              id="report-filter-author"
              value={draftFilters.authorId ?? ""}
              onChange={(event) =>
                setDraftFilters({
                  ...draftFilters,
                  authorId: event.target.value || null,
                })
              }
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All authors</option>
              {Object.entries(authorNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {audience === "management" &&
        Object.keys(departmentNames).length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="report-filter-department">Department</Label>
            <select
              id="report-filter-department"
              value={draftFilters.departmentId ?? ""}
              onChange={(event) =>
                setDraftFilters({
                  ...draftFilters,
                  departmentId: event.target.value || null,
                })
              }
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All departments</option>
              {Object.entries(departmentNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {workspaces.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="report-filter-workspace">Workspace</Label>
            <select
              id="report-filter-workspace"
              value={draftFilters.workspaceId ?? ""}
              onChange={(event) =>
                setDraftFilters({
                  ...draftFilters,
                  workspaceId: event.target.value || null,
                })
              }
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
          <ReportActionButton
            busy={busy}
            disabled={
              incompleteRange ||
              reversedRange ||
              overlongRange ||
              !onFiltersChange
            }
            onClick={() => onFiltersChange?.(draftFilters)}
          >
            Apply
          </ReportActionButton>
          <ReportActionButton
            busy={busy}
            variant="outline"
            onClick={() => {
              setDraftFilters(EMPTY_FILTERS);
              onFiltersChange?.(EMPTY_FILTERS);
            }}
          >
            Clear
          </ReportActionButton>
        </div>
        {incompleteRange || reversedRange || overlongRange ? (
          <p
            role="alert"
            className="text-destructive text-sm sm:col-span-2 lg:col-span-3"
          >
            {incompleteRange
              ? "Enter both period dates or leave both blank."
              : reversedRange
                ? "Period end must be on or after period start."
                : "Choose a range of at most 366 days."}
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
        <div className={`${styles.panel} border-dashed p-8 text-center`}>
          <ClipboardList
            aria-hidden="true"
            className="text-primary mx-auto mb-3 size-8"
          />
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
          busy={busy}
        />
      )}

      {list && pageCount > 1 ? (
        <nav
          aria-label="Reports pagination"
          className="flex items-center justify-between gap-3"
        >
          <ReportActionButton
            busy={busy}
            variant="outline"
            disabled={list.page <= 1}
            onClick={() => onPageChange?.(list.page - 1)}
          >
            Previous
          </ReportActionButton>
          <span className="text-muted-foreground text-sm">
            Page {list.page} of {pageCount}
          </span>
          <ReportActionButton
            busy={busy}
            variant="outline"
            disabled={list.page >= pageCount}
            onClick={() => onPageChange?.(list.page + 1)}
          >
            Next
          </ReportActionButton>
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
            focusVersion={focusVersion}
            authorName={
              detail.authorId === currentUserId
                ? "You"
                : (authorNames[detail.authorId] ?? `User ${detail.authorId}`)
            }
            departmentName={
              detail.departmentId
                ? (departmentNames[detail.departmentId] ??
                  `Department ${detail.departmentId}`)
                : "No department"
            }
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
          className={`${styles.panel} p-4 sm:p-6`}
        >
          <h2 id="draft-title" className="mb-2 text-xl font-semibold">
            {editing === "new" ? "New report draft" : "Edit report draft"}
          </h2>
          <p className="text-muted-foreground mb-5 text-sm">
            Capture your work in your own words. Saving a draft does not submit
            it for review.
          </p>
          <ReportDraftForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            workspaces={workspaces}
            warning={workspaceWarning}
            busy={busy}
            onCancel={closeEditor}
            onSave={(values) => {
              void Promise.resolve(
                onSaveDraft(values, editing === "new" ? undefined : editing.id),
              ).then((saved) => {
                if (saved) closeEditor();
              });
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
