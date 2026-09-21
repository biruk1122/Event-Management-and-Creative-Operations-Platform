"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Plus, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

import { CampaignProgress } from "./campaign-progress";
import { ActivityStatusBadge } from "./status-badges";
import type {
  CampaignActivityValues,
  CreateCampaignActivity,
  DeleteCampaignActivity,
  ListCampaignActivities,
  UpdateCampaignActivity,
} from "../lib/campaigns-outcome";
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_STATUSES,
  activityStatusLabel,
  progressOf,
  scheduleSummary,
  type CampaignActivity,
  type CampaignActivityStatus,
  type CampaignProgress as Progress,
} from "../lib/campaigns-types";

const ACTION_ERRORS: Record<string, string> = {
  schedule_invalid: "The end must be on or after the start.",
  not_found: "This activity no longer exists. Refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

/** An ISO instant as the value a `datetime-local` input expects (no seconds, no zone). */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function valuesFrom(activity: CampaignActivity): CampaignActivityValues {
  return {
    name: activity.name,
    description: activity.description ?? "",
    status: activity.status,
    startAt: toLocalInput(activity.startAt),
    endAt: toLocalInput(activity.endAt),
  };
}

const EMPTY_VALUES: CampaignActivityValues = {
  name: "",
  description: "",
  status: "PLANNED",
  startAt: "",
  endAt: "",
};

interface CampaignActivitiesProps {
  campaignId: string;
  listActivities: ListCampaignActivities;
  createActivity: CreateCampaignActivity;
  updateActivity: UpdateCampaignActivity;
  deleteActivity: DeleteCampaignActivity;
  /** Whether the caller may add, edit, change the status of, and remove activities. */
  canManage: boolean;
  /** Called with the derived progress whenever the activity set changes. */
  onProgressChange: (progress: Progress) => void;
}

/**
 * A campaign's activities: the planned units of work its progress is derived
 * from. Loads them itself so a failure here does not block the rest of the
 * campaign detail.
 */
export function CampaignActivities({
  campaignId,
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  canManage,
  onProgressChange,
}: CampaignActivitiesProps) {
  const headingId = useId();

  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [activities, setActivities] = useState<CampaignActivity[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  /** "new" while adding, an activity id while editing, `null` when idle. */
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listActivities(campaignId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setState("error");
          return;
        }
        setActivities(loaded);
        setState("loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, listActivities, reloadKey]);

  useEffect(() => {
    if (confirmingId) confirmRef.current?.focus();
  }, [confirmingId]);

  function commit(next: CampaignActivity[]) {
    setActivities(next);
    onProgressChange(progressOf(next));
  }

  async function changeStatus(
    activity: CampaignActivity,
    status: CampaignActivityStatus,
  ) {
    setBusyId(activity.id);
    setRowError(null);
    const outcome = await updateActivity(campaignId, activity.id, {
      ...valuesFrom(activity),
      status,
    });
    setBusyId(null);
    if (outcome.status === "success") {
      commit(
        activities.map((item) =>
          item.id === activity.id ? outcome.activity : item,
        ),
      );
      setAnnouncement(
        `${activity.name} marked ${activityStatusLabel(status).toLowerCase()}.`,
      );
      return;
    }
    setRowError({ id: activity.id, message: actionError(outcome.status) });
  }

  async function remove(activity: CampaignActivity) {
    setBusyId(activity.id);
    setRowError(null);
    const outcome = await deleteActivity(campaignId, activity.id);
    setBusyId(null);
    setConfirmingId(null);
    if (outcome.status === "success") {
      commit(activities.filter((item) => item.id !== activity.id));
      setAnnouncement(`${activity.name} removed.`);
      return;
    }
    setRowError({ id: activity.id, message: actionError(outcome.status) });
  }

  async function save(
    values: CampaignActivityValues,
    activityId: string | null,
  ): Promise<{ error: string | null; fieldErrors?: { name?: string } }> {
    const outcome =
      activityId === null
        ? await createActivity(campaignId, values)
        : await updateActivity(campaignId, activityId, values);
    if (outcome.status === "success") {
      commit(
        activityId === null
          ? [...activities, outcome.activity]
          : activities.map((item) =>
              item.id === activityId ? outcome.activity : item,
            ),
      );
      setEditing(null);
      setAnnouncement(
        activityId === null ? "Activity added." : "Activity saved.",
      );
      return { error: null };
    }
    if (outcome.status === "field_errors") {
      return { error: null, fieldErrors: outcome.fieldErrors };
    }
    return { error: actionError(outcome.status) };
  }

  const progress = progressOf(activities);

  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={headingId} className="text-sm font-medium">
          Activities
        </p>
        {state === "loaded" && editing === null && canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing("new")}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add activity
          </Button>
        ) : null}
      </div>

      {state === "loading" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 py-4 text-sm"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading activities…
        </div>
      ) : null}

      {state === "error" ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>We could not load the activities</AlertTitle>
          <AlertDescription>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setState("loading");
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {state === "loaded" ? (
        <>
          <CampaignProgress
            progress={progress}
            label="Progress from activities"
          />

          {editing === "new" ? (
            <ActivityForm
              key="new"
              title="New activity"
              submitLabel="Add activity"
              initial={EMPTY_VALUES}
              onSave={(values) => save(values, null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}

          {activities.length === 0 && editing !== "new" ? (
            <p className="text-muted-foreground text-sm">
              {canManage
                ? "No activities yet. Add the first planned unit of work."
                : "No activities yet."}
            </p>
          ) : null}

          <ul className="space-y-2">
            {activities.map((activity) =>
              editing === activity.id ? (
                <li key={activity.id}>
                  <ActivityForm
                    title={`Edit ${activity.name}`}
                    submitLabel="Save activity"
                    initial={valuesFrom(activity)}
                    onSave={(values) => save(values, activity.id)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <li
                  key={activity.id}
                  className="border-border space-y-2 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {activity.name}
                      </span>
                      <ActivityStatusBadge status={activity.status} />
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {scheduleSummary(activity)}
                    </span>
                  </div>
                  {activity.description ? (
                    <p className="text-muted-foreground text-sm">
                      {activity.description}
                    </p>
                  ) : null}

                  {canManage ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-full space-y-1 sm:w-64">
                        <ActivityStatusSelect
                          activity={activity}
                          disabled={busyId === activity.id}
                          onChange={(status) =>
                            void changeStatus(activity, status)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === activity.id}
                        aria-label={`Edit ${activity.name}`}
                        onClick={() => {
                          setConfirmingId(null);
                          setEditing(activity.id);
                        }}
                      >
                        Edit
                      </Button>
                      {confirmingId === activity.id ? (
                        <>
                          <span className="text-sm">Remove this activity?</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === activity.id}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            ref={confirmRef}
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busyId === activity.id}
                            aria-busy={busyId === activity.id}
                            onClick={() => void remove(activity)}
                          >
                            {busyId === activity.id
                              ? "Working…"
                              : `Confirm remove ${activity.name}`}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === activity.id}
                          aria-label={`Remove ${activity.name}`}
                          onClick={() => setConfirmingId(activity.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ) : null}
                  {rowError?.id === activity.id ? (
                    <p className="text-destructive text-sm" role="alert">
                      {rowError.message}
                    </p>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        </>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

interface ActivityStatusSelectProps {
  activity: CampaignActivity;
  disabled: boolean;
  onChange: (status: CampaignActivityStatus) => void;
}

function ActivityStatusSelect({
  activity,
  disabled,
  onChange,
}: ActivityStatusSelectProps) {
  const id = useId();
  return (
    <>
      <Label htmlFor={id} className="text-xs">
        Status of {activity.name}
      </Label>
      <Select
        value={activity.status}
        disabled={disabled}
        onValueChange={(value) => onChange(value as CampaignActivityStatus)}
      >
        <SelectTrigger id={id} aria-busy={disabled}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIVITY_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {ACTIVITY_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

interface ActivityFormProps {
  title: string;
  submitLabel: string;
  initial: CampaignActivityValues;
  onSave: (
    values: CampaignActivityValues,
  ) => Promise<{ error: string | null; fieldErrors?: { name?: string } }>;
  onCancel: () => void;
}

function ActivityForm({
  title,
  submitLabel,
  initial,
  onSave,
  onCancel,
}: ActivityFormProps) {
  const ids = {
    name: useId(),
    description: useId(),
    status: useId(),
    startAt: useId(),
    endAt: useId(),
  };
  const nameRef = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<CampaignActivityValues>(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function set<K extends keyof CampaignActivityValues>(
    key: K,
    value: CampaignActivityValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setNameError(null);
    setEndError(null);

    let invalid = false;
    if (values.name.trim() === "") {
      setNameError("Enter a name.");
      invalid = true;
    }
    if (
      values.startAt !== "" &&
      values.endAt !== "" &&
      values.endAt < values.startAt
    ) {
      setEndError("The end must be on or after the start.");
      invalid = true;
    }
    if (invalid) return;

    setBusy(true);
    const result = await onSave(values);
    setBusy(false);
    if (result.fieldErrors?.name) setNameError(result.fieldErrors.name);
    if (result.error) {
      if (result.error === ACTION_ERRORS.schedule_invalid) {
        setEndError(result.error);
      } else {
        setFormError(result.error);
      }
    }
  }

  return (
    <form
      aria-label={title}
      noValidate
      className="border-border bg-muted/30 space-y-3 rounded-lg border p-3"
      onSubmit={(event) => void submit(event)}
    >
      <p className="text-sm font-medium">{title}</p>

      <div className="space-y-1">
        <Label htmlFor={ids.name}>Activity name</Label>
        <Input
          id={ids.name}
          ref={nameRef}
          value={values.name}
          disabled={busy}
          required
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${ids.name}-error` : undefined}
          onChange={(event) => set("name", event.target.value)}
        />
        {nameError ? (
          <p id={`${ids.name}-error`} className="text-destructive text-sm">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor={ids.description}>Activity description</Label>
        <textarea
          id={ids.description}
          rows={2}
          value={values.description}
          disabled={busy}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => set("description", event.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={ids.status}>Activity status</Label>
          <Select
            value={values.status}
            disabled={busy}
            onValueChange={(value) =>
              set("status", value as CampaignActivityStatus)
            }
          >
            <SelectTrigger id={ids.status}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {ACTIVITY_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.startAt}>Activity starts (UTC)</Label>
          <Input
            id={ids.startAt}
            type="datetime-local"
            value={values.startAt}
            disabled={busy}
            onChange={(event) => set("startAt", event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.endAt}>Activity ends (UTC)</Label>
          <Input
            id={ids.endAt}
            type="datetime-local"
            value={values.endAt}
            disabled={busy}
            aria-invalid={endError ? true : undefined}
            aria-describedby={endError ? `${ids.endAt}-error` : undefined}
            onChange={(event) => set("endAt", event.target.value)}
          />
          {endError ? (
            <p id={`${ids.endAt}-error`} className="text-destructive text-sm">
              {endError}
            </p>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
