"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReportActionButton } from "./report-action-button";

import {
  NARRATIVE_FIELDS,
  REPORT_TYPES,
  TYPE_LABELS,
  type CreateReport,
  type ReportDetail,
  type ReportType,
} from "../lib/report-presentation";

export interface WorkspaceChoice {
  id: string;
  name: string;
}

interface ReportDraftFormProps {
  initial?: ReportDetail | null;
  workspaces: readonly WorkspaceChoice[];
  warning?: string | null | undefined;
  busy?: boolean;
  onCancel: () => void;
  onSave: (values: CreateReport) => void;
}

export function ReportDraftForm({
  initial,
  workspaces,
  warning,
  busy = false,
  onCancel,
  onSave,
}: ReportDraftFormProps) {
  const prefix = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ReportType>(initial?.type ?? "DAILY");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(
    initial?.workspaceIds ?? [],
  );
  const [sections, setSections] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.values(NARRATIVE_FIELDS)
        .flat()
        .map(({ key }) => [key, String(initial?.[key] ?? "")]),
    ),
  );
  const completedSections = NARRATIVE_FIELDS[type].filter(({ key }) =>
    sections[key]?.trim(),
  ).length;

  useEffect(() => titleRef.current?.focus(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const sections = Object.fromEntries(
      NARRATIVE_FIELDS[type]
        .map(({ key }) => [key, String(form.get(key) ?? "").trim()] as const)
        .filter(([, value]) => value.length > 0),
    );
    onSave({
      title: String(form.get("title") ?? "").trim(),
      type,
      periodStart: String(form.get("periodStart") ?? ""),
      periodEnd: String(form.get("periodEnd") ?? ""),
      workspaceIds,
      ...sections,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
      aria-label="Report draft"
      aria-busy={busy}
    >
      <fieldset className="bg-muted/40 grid gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-5">
        <legend className="px-2 text-sm font-semibold">Report details</legend>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-title`}>Title</Label>
          <Input
            ref={titleRef}
            id={`${prefix}-title`}
            name="title"
            defaultValue={initial?.title ?? ""}
            maxLength={200}
            required
            readOnly={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-type`}>Report type</Label>
          <select
            id={`${prefix}-type`}
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as ReportType)}
            disabled={busy}
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2"
          >
            {REPORT_TYPES.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-start`}>Period start (UTC)</Label>
          <Input
            id={`${prefix}-start`}
            name="periodStart"
            type="date"
            defaultValue={initial?.periodStart ?? ""}
            required
            readOnly={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-end`}>Period end (UTC)</Label>
          <Input
            id={`${prefix}-end`}
            name="periodEnd"
            type="date"
            defaultValue={initial?.periodEnd ?? ""}
            required
            readOnly={busy}
          />
        </div>
      </fieldset>
      <p className="text-muted-foreground text-sm">
        Daily reports cover one day, weekly reports seven days, and monthly
        reports a whole calendar month. All dates use UTC.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Your work narrative</h3>
        <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium">
          {completedSections} of {NARRATIVE_FIELDS[type].length} sections filled
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {NARRATIVE_FIELDS[type].map(({ key, label }) => (
          <div
            key={key}
            className="bg-muted/40 space-y-2 rounded-xl border p-4"
          >
            <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
            <Textarea
              id={`${prefix}-${key}`}
              name={key}
              value={sections[key] ?? ""}
              onChange={(event) =>
                setSections((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
              maxLength={5000}
              rows={5}
              readOnly={busy}
              aria-describedby={`${prefix}-narrative-hint`}
            />
          </div>
        ))}
      </div>
      <p
        id={`${prefix}-narrative-hint`}
        className="text-muted-foreground text-sm"
      >
        These sections may be left blank in a draft; complete them before
        submission.
      </p>
      <fieldset className="space-y-3 rounded-xl border p-4" disabled={busy}>
        <legend className="px-2 text-sm font-semibold">
          Related workspaces
        </legend>
        {warning ? (
          <p role="status" className="text-muted-foreground text-sm">
            {warning}
          </p>
        ) : null}
        {workspaces.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No workspaces are available to link.
          </p>
        ) : (
          workspaces.map((workspace) => (
            <label
              key={workspace.id}
              className="bg-muted/40 flex min-h-11 items-center gap-3 rounded-lg p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={workspaceIds.includes(workspace.id)}
                disabled={
                  busy ||
                  (workspaceIds.length >= 20 &&
                    !workspaceIds.includes(workspace.id))
                }
                onChange={(event) =>
                  setWorkspaceIds((current) =>
                    event.target.checked
                      ? [...current, workspace.id]
                      : current.filter((id) => id !== workspace.id),
                  )
                }
                className="accent-primary size-4"
              />
              {workspace.name}
            </label>
          ))
        )}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
        <ReportActionButton
          type="button"
          variant="outline"
          onClick={onCancel}
          busy={busy}
        >
          Cancel
        </ReportActionButton>
        <ReportActionButton type="submit" busy={busy}>
          {busy ? "Saving…" : "Save draft"}
        </ReportActionButton>
      </div>
    </form>
  );
}
