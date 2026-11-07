import type { Route } from "next";

import { formatInZone } from "@/lib/app-timezone";

import {
  eventStatusLabel,
  type Event,
  type EventActivity,
  type EventMilestoneStatus,
  type EventStatus,
} from "./events-types";

/** The workspace tabs. Each has its own URL, so a refresh keeps the tab. */
export const EVENT_WORKSPACE_TABS = [
  { segment: "", label: "Overview" },
  { segment: "details", label: "Details" },
  { segment: "teams", label: "Teams" },
  { segment: "talents", label: "Talents" },
  { segment: "tasks", label: "Tasks" },
  { segment: "calendar", label: "Calendar" },
  { segment: "meetings", label: "Meetings" },
] as const;

export type EventWorkspaceTab = (typeof EVENT_WORKSPACE_TABS)[number];

export function eventWorkspacePath(eventId: string, segment = ""): Route {
  return `/events/${eventId}${segment ? `/${segment}` : ""}` as Route;
}

/** The tab a pathname belongs to; a nested path keeps its parent tab active. */
export function activeWorkspaceTab(
  eventId: string,
  pathname: string,
): EventWorkspaceTab {
  const rest = pathname.slice(`/events/${eventId}`.length).replace(/^\//, "");
  const segment = rest.split("/")[0] ?? "";
  return (
    EVENT_WORKSPACE_TABS.find((tab) => tab.segment === segment) ??
    EVENT_WORKSPACE_TABS[0]
  );
}

/** The event's reference, for example EVT-024. */
export function eventReference(event: Pick<Event, "eventNumber">): string {
  return `EVT-${String(event.eventNumber).padStart(3, "0")}`;
}

/** Event times are stored as UTC and shown in the app timezone. */
const DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

function formatPart(iso: string, options: Intl.DateTimeFormatOptions): string {
  return formatInZone(iso, options);
}

/** "Oct 24, 17:00–23:00", or both dates when the event spans days. */
export function workspaceSchedule(
  event: Pick<Event, "startAt" | "endAt">,
): string {
  const { startAt, endAt } = event;
  if (!startAt && !endAt) return "Not scheduled";
  if (!startAt || !endAt) {
    const only = (startAt ?? endAt)!;
    return `${formatPart(only, DATE)}, ${formatPart(only, TIME)}`;
  }
  const startDate = formatPart(startAt, DATE);
  const endDate = formatPart(endAt, DATE);
  return startDate === endDate
    ? `${startDate}, ${formatPart(startAt, TIME)}–${formatPart(endAt, TIME)}`
    : `${startDate}, ${formatPart(startAt, TIME)} – ${endDate}, ${formatPart(endAt, TIME)}`;
}

/** "Oct 24, 2026 · 17:00", or a dash when unset. */
export function detailDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = formatPart(iso, { ...DATE, year: "numeric" });
  return `${date} · ${formatPart(iso, TIME)}`;
}

/** A milestone's calendar date, read without shifting it across time zones. */
export function milestoneDate(date: string): string {
  // A calendar date has no time zone, so it is read as UTC midnight and never shifted.
  return new Intl.DateTimeFormat("en", { ...DATE, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}

export const MILESTONE_STATUSES: readonly EventMilestoneStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
];

export const MILESTONE_STATUS_LABELS: Record<EventMilestoneStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

/** 2500000 as "2.5m". */
export function compactAmount(amount: string | number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(Number(amount))
    .toLowerCase();
}

/** Readiness is the share of linked tasks done; null when none are linked. */
export function readinessPercent(tasks: {
  completed: number;
  total: number;
}): number | null {
  return tasks.total === 0
    ? null
    : Math.round((tasks.completed / tasks.total) * 100);
}

const ACTIVITY_PHRASES: Record<string, string> = {
  "event.created": "created this event",
  "event.updated": "updated the event details",
  "event.manager_changed": "changed the event manager",
  "event.team_assigned": "assigned a team",
  "event.team_removed": "removed a team",
  "event.budget_changed": "updated the budget",
  "task.assignee_added": "assigned someone to a task",
  "task.assignee_removed": "removed someone from a task",
  "task.submitted_for_review": "submitted a task for review",
  "task.review.approved": "approved a task",
  "task.review.changes_requested": "requested changes on a task",
  "talent.assignment.created": "assigned a talent",
  "talent.assignment.updated": "updated a talent assignment",
  "talent.assignment.completed": "completed a talent assignment",
  "talent.assignment.cancelled": "cancelled a talent assignment",
};

const MILESTONE_PHRASES: Record<string, string> = {
  "event.milestone.created": "added the milestone",
  "event.milestone.updated": "updated the milestone",
  "event.milestone.deleted": "removed the milestone",
};

/** The sentence after the actor's name in the activity feed. */
export function activityPhrase(
  item: Pick<EventActivity, "action" | "subject">,
): string {
  const milestone = MILESTONE_PHRASES[item.action];
  if (milestone) return `${milestone} “${item.subject ?? "untitled"}”`;
  if (item.action === "event.status_changed") {
    return item.subject
      ? `moved the event to ${eventStatusLabel(item.subject as EventStatus)}`
      : "changed the event status";
  }
  return ACTIVITY_PHRASES[item.action] ?? "updated this event";
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

const LISTING_KEY = "lela:events-listing-query";

/** Remembers the listing's filters, so the breadcrumb can return to them. */
export function rememberEventsListing(query: string): void {
  try {
    window.sessionStorage.setItem(LISTING_KEY, query);
  } catch {
    // Without storage the breadcrumb returns to the plain listing.
  }
}

export function eventsListingPath(): Route {
  try {
    const query = window.sessionStorage.getItem(LISTING_KEY);
    return (query ? `/events?${query}` : "/events") as Route;
  } catch {
    return "/events" as Route;
  }
}
