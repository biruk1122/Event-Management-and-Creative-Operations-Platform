"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  busy?: boolean;
  onCancel: () => void;
  onSave: (values: CreateReport) => void;
}

export function ReportDraftForm({
  initial,
  workspaces,
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

  useEffect(() => titleRef.current?.focus(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <form onSubmit={submit} className="space-y-5" aria-label="Report draft">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-title`}>Title</Label>
          <Input
            ref={titleRef}
            id={`${prefix}-title`}
            name="title"
            defaultValue={initial?.title ?? ""}
            maxLength={200}
            required
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Daily reports cover one day, weekly reports seven days, and monthly
        reports a whole calendar month. All dates use UTC.
      </p>
      {NARRATIVE_FIELDS[type].map(({ key, label }) => (
        <div key={key} className="space-y-2">
          <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
          <Textarea
            id={`${prefix}-${key}`}
            name={key}
            defaultValue={initial?.[key] ?? ""}
            maxLength={5000}
            rows={3}
            disabled={busy}
            aria-describedby={`${prefix}-narrative-hint`}
          />
        </div>
      ))}
      <p
        id={`${prefix}-narrative-hint`}
        className="text-muted-foreground text-sm"
      >
        These sections may be left blank in a draft; complete them before
        submission.
      </p>
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium">Related workspaces</legend>
        {workspaces.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No workspaces are available to link.
          </p>
        ) : (
          workspaces.map((workspace) => (
            <label
              key={workspace.id}
              className="flex items-center gap-2 text-sm"
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
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
