"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  CampaignDetailWriteResult,
  CampaignMetric,
  CampaignMetricKey,
  RecordMetricValues,
} from "../api/campaign-detail-gateway";
import { personName } from "../lib/campaigns-types";

/** The five metric keys agreed for promotion campaigns (EVE-231). */
export const METRIC_KEYS: readonly CampaignMetricKey[] = [
  "REACH",
  "ENGAGEMENT",
  "TICKETS_SOLD",
  "ATTENDANCE",
  "OTHER",
];

export const METRIC_LABELS: Record<CampaignMetricKey, string> = {
  REACH: "Reach",
  ENGAGEMENT: "Engagement",
  TICKETS_SOLD: "Tickets sold",
  ATTENDANCE: "Attendance",
  OTHER: "Other",
};

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VALUE = 999_999_999_999;

export type CampaignMetricsPanelProps = {
  campaignId: string;
  canWrite: boolean;
  list: (campaignId: string) => Promise<CampaignMetric[] | null>;
  record: (
    campaignId: string,
    values: RecordMetricValues,
  ) => Promise<CampaignDetailWriteResult<CampaignMetric>>;
};

/** Checks the entry before it is sent, mirroring the server's rules. */
export function metricFieldError(input: {
  value: string;
  recordedOn: string;
}): { value?: string; recordedOn?: string } {
  const errors: { value?: string; recordedOn?: string } = {};
  const trimmed = input.value.trim();
  const number = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(number)) {
    errors.value = "Enter the figure as a number.";
  } else if (number < 0 || number > MAX_VALUE) {
    errors.value = "Enter a figure from 0 up.";
  } else if (/\.\d{3,}$/.test(trimmed)) {
    errors.value = "Use at most two decimal places.";
  }
  if (!CALENDAR_DAY.test(input.recordedOn)) {
    errors.recordedOn = "Choose the day the figure was recorded.";
  } else {
    const day = new Date(`${input.recordedOn}T00:00:00.000Z`);
    if (day.toISOString().slice(0, 10) !== input.recordedOn) {
      errors.recordedOn = "Choose a real calendar day.";
    }
  }
  return errors;
}

/**
 * Recorded metrics (EVE-231). Each figure is shown exactly as it was recorded.
 * Nothing here is computed, estimated or totalled; a correction is a new row.
 */
export function CampaignMetricsPanel({
  campaignId,
  canWrite,
  list,
  record,
}: CampaignMetricsPanelProps) {
  const ids = {
    heading: useId(),
    key: useId(),
    value: useId(),
    day: useId(),
    source: useId(),
  };
  const [entries, setEntries] = useState<CampaignMetric[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [key, setKey] = useState<CampaignMetricKey>("REACH");
  const [value, setValue] = useState("");
  const [recordedOn, setRecordedOn] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [errors, setErrors] = useState<{ value?: string; recordedOn?: string }>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let active = true;
    list(campaignId).then(
      (loaded) => {
        if (!active) return;
        if (loaded === null) setLoadFailed(true);
        else setEntries(loaded);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [campaignId, list]);

  async function submit() {
    const fieldErrors = metricFieldError({ value, recordedOn });
    setErrors(fieldErrors);
    if (fieldErrors.value || fieldErrors.recordedOn) return;
    setBusy(true);
    setFormError(null);
    const outcome = await record(campaignId, {
      key,
      value: Number(value.trim()),
      recordedOn,
      sourceNote: sourceNote.trim() === "" ? null : sourceNote.trim(),
    });
    setBusy(false);
    if (outcome.status === "success") {
      setEntries((current) => [outcome.value, ...(current ?? [])]);
      setValue("");
      setSourceNote("");
      setAnnouncement(`${METRIC_LABELS[key]} recorded.`);
      return;
    }
    setFormError(outcome.message);
  }

  return (
    <section
      aria-labelledby={ids.heading}
      className="border-border space-y-3 border-t pt-4"
    >
      <div>
        <p id={ids.heading} className="text-sm font-medium">
          Recorded metrics
        </p>
        <p className="text-muted-foreground text-sm">
          Shown exactly as recorded. Nothing is calculated from these figures.
        </p>
      </div>

      {loadFailed ? (
        <p role="alert" className="text-destructive text-sm">
          The metrics could not be loaded. Close and reopen the campaign to try
          again.
        </p>
      ) : entries === null ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading metrics…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No metrics recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Metric
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Value
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Recorded on
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Source
                </th>
                <th scope="col" className="py-2 font-medium">
                  By
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((metric) => (
                <tr key={metric.id} className="border-t">
                  <td className="py-2 pr-3">{METRIC_LABELS[metric.key]}</td>
                  <td className="py-2 pr-3 tabular-nums">{metric.value}</td>
                  <td className="py-2 pr-3">{metric.recordedOn}</td>
                  <td className="py-2 pr-3">{metric.sourceNote ?? "—"}</td>
                  <td className="py-2">
                    {metric.recordedBy
                      ? personName(metric.recordedBy)
                      : "A former team member"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite ? (
        <form
          aria-label="Record a metric"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={ids.key}>Metric</Label>
            <Select
              value={key}
              disabled={busy}
              onValueChange={(next) => setKey(next as CampaignMetricKey)}
            >
              <SelectTrigger id={ids.key}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_KEYS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {METRIC_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.value}>Value</Label>
            <Input
              id={ids.value}
              inputMode="decimal"
              value={value}
              disabled={busy}
              aria-invalid={errors.value ? true : undefined}
              aria-describedby={errors.value ? `${ids.value}-error` : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            {errors.value ? (
              <p id={`${ids.value}-error`} className="text-destructive text-sm">
                {errors.value}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.day}>Recorded on</Label>
            <Input
              id={ids.day}
              type="date"
              value={recordedOn}
              disabled={busy}
              aria-invalid={errors.recordedOn ? true : undefined}
              aria-describedby={
                errors.recordedOn ? `${ids.day}-error` : undefined
              }
              onChange={(event) => setRecordedOn(event.target.value)}
            />
            {errors.recordedOn ? (
              <p id={`${ids.day}-error`} className="text-destructive text-sm">
                {errors.recordedOn}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.source}>Source (optional)</Label>
            <Input
              id={ids.source}
              value={sourceNote}
              disabled={busy}
              placeholder="For example, a platform report"
              onChange={(event) => setSourceNote(event.target.value)}
            />
          </div>
          {formError ? (
            <p role="alert" className="text-destructive text-sm sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
              {busy ? "Recording…" : "Record metric"}
            </Button>
          </div>
        </form>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
