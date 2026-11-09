"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { activityStatusLabel } from "@/features/campaigns/lib/campaigns-types";
import { listAllPromotionActivities } from "@/features/promotion/api/promotion-gateway";
import { listTasks } from "@/features/tasks/api/tasks-gateway";
import { taskStatusLabel } from "@/features/tasks/lib/tasks-types";
import { APP_TIME_ZONE, formatInZone } from "@/lib/app-timezone";

import { listUpcomingPromotionEvents } from "../api/promotion-workspace-gateway";
import {
  dayKey,
  groupEntriesByDay,
  inMonth,
  monthGrid,
  monthOf,
  monthRange,
  shiftMonth,
  type CalendarEntry,
  type CalendarEntryKind,
  type CalendarMonth,
} from "../lib/promotion-calendar";

const KIND_LABELS: Record<CalendarEntryKind, string> = {
  event: "Event",
  activity: "Activity",
  deadline: "Task deadline",
};

// Text and a left rule, not colour alone, tell the kinds apart.
const KIND_STYLES: Record<CalendarEntryKind, string> = {
  event: "border-l-chart-1",
  activity: "border-l-chart-2",
  deadline: "border-l-chart-4",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const timeOf = (iso: string) =>
  formatInZone(iso, { hour: "numeric", minute: "2-digit" }, APP_TIME_ZONE);

function dayHeading(key: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}

function monthHeading(month: CalendarMonth): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month - 1, 15)));
}

export interface PromotionCalendarSources {
  events: boolean;
  activities: boolean;
  deadlines: boolean;
}

/**
 * The Promotion calendar (EVE-234): upcoming events, promotional activities
 * and the team's task deadlines in one month, as a grid or a list. Each
 * source is read with the viewer's own permissions; a source the viewer
 * cannot read is left out and said so.
 */
export function PromotionCalendarView({
  userId,
  sources,
  departmentId,
}: {
  userId: string;
  sources: PromotionCalendarSources;
  /** The Promotion department, for the team's deadlines. */
  departmentId: string | null;
}) {
  const [month, setMonth] = useState<CalendarMonth>(() =>
    monthOf(new Date().toISOString()),
  );
  const [view, setView] = useState<"month" | "list">("month");
  const range = monthRange(month);
  const monthKey = `${month.year}-${month.month}`;

  const [events, activities, deadlines] = useQueries({
    queries: [
      {
        queryKey: [
          "promotion-workspace",
          userId,
          "calendar",
          "events",
          monthKey,
        ],
        enabled: sources.events,
        retry: false,
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (
            await listUpcomingPromotionEvents(
              { from: range.from, to: range.to },
              signal,
            )
          ).map<CalendarEntry>((event) => ({
            id: `event:${event.id}`,
            kind: "event",
            title: event.name,
            at: event.startAt,
            detail: [event.location, event.departmentName]
              .filter(Boolean)
              .join(" · "),
          })),
      },
      {
        queryKey: [
          "promotion-workspace",
          userId,
          "calendar",
          "activities",
          monthKey,
        ],
        enabled: sources.activities,
        retry: false,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const entries: CalendarEntry[] = [];
          for (let page = 1; page <= 10; page += 1) {
            const result = await listAllPromotionActivities(
              { from: range.from, to: range.to, page, pageSize: 100 },
              signal,
            );
            for (const row of result.items) {
              if (!row.activity.startAt) continue;
              entries.push({
                id: `activity:${row.activity.id}`,
                kind: "activity",
                title: row.activity.name,
                at: row.activity.startAt,
                detail: [
                  row.campaignName,
                  activityStatusLabel(row.activity.status),
                  row.location,
                ]
                  .filter(Boolean)
                  .join(" · "),
              });
            }
            if (page * 100 >= result.total || result.items.length === 0) break;
          }
          return entries;
        },
      },
      {
        queryKey: [
          "promotion-workspace",
          userId,
          "calendar",
          "deadlines",
          departmentId,
          monthKey,
        ],
        enabled: sources.deadlines,
        retry: false,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const entries: CalendarEntry[] = [];
          for (let page = 1; page <= 10; page += 1) {
            const result = await listTasks(
              {
                ...(departmentId ? { departmentId } : {}),
                sort: "DUE_AT",
                page,
                pageSize: 100,
              },
              signal,
            );
            for (const task of result.items) {
              if (!task.dueAt || !inMonth(task.dueAt, month)) continue;
              entries.push({
                id: `task:${task.id}`,
                kind: "deadline",
                title: task.title,
                at: task.dueAt,
                detail: taskStatusLabel(task.status),
              });
            }
            if (page * 100 >= result.total || result.items.length === 0) break;
          }
          return entries;
        },
      },
    ],
  });

  const parts = [
    { label: "events", enabled: sources.events, query: events },
    { label: "activities", enabled: sources.activities, query: activities },
    { label: "task deadlines", enabled: sources.deadlines, query: deadlines },
  ];
  const loading = parts.some((part) => part.enabled && part.query.isPending);
  const failed = parts.filter((part) => part.enabled && part.query.isError);
  const entries = parts.flatMap((part) =>
    part.enabled && part.query.data ? part.query.data : [],
  );
  const byDay = groupEntriesByDay(entries);
  const today = dayKey(new Date().toISOString());

  return (
    <section aria-label="Promotion calendar" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h3 className="min-w-40 text-center font-medium" aria-live="polite">
            {monthHeading(month)}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMonth(monthOf(new Date().toISOString()))}
          >
            Today
          </Button>
        </div>
        <div role="group" aria-label="Calendar view" className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={view === "month" ? "secondary" : "ghost"}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Month
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </Button>
        </div>
      </div>

      <ul className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        {(Object.keys(KIND_LABELS) as CalendarEntryKind[]).map((kind) => (
          <li key={kind} className={`border-l-4 pl-2 ${KIND_STYLES[kind]}`}>
            {KIND_LABELS[kind]}
          </li>
        ))}
      </ul>

      {failed.length > 0 ? (
        <p role="alert" className="text-sm">
          Some {failed.map((part) => part.label).join(" and ")} could not be
          loaded.{" "}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => failed.forEach((part) => void part.query.refetch())}
          >
            Try again
          </Button>
        </p>
      ) : null}

      {loading ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading the calendar…
        </p>
      ) : view === "list" ? (
        byDay.size === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing scheduled in {monthHeading(month)}.
          </p>
        ) : (
          <div className="space-y-4">
            {[...byDay.entries()].map(([key, list]) => (
              <section
                key={key}
                aria-label={dayHeading(key)}
                className="space-y-2"
              >
                <h4 className="text-sm font-medium">{dayHeading(key)}</h4>
                <ul className="space-y-2">
                  {list.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-lg border border-l-4 p-3 ${KIND_STYLES[entry.kind]}`}
                    >
                      <p className="text-sm font-medium">{entry.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {KIND_LABELS[entry.kind]} · {timeOf(entry.at)}
                        {entry.detail ? ` · ${entry.detail}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] table-fixed border-collapse text-xs">
            <caption className="sr-only">
              {monthHeading(month)}: events, activities and task deadlines
            </caption>
            <thead>
              <tr>
                {WEEKDAYS.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className="text-muted-foreground py-1 text-left font-medium"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(month).map((week, index) => (
                <tr key={index}>
                  {week.map((key, cell) => {
                    if (!key)
                      return (
                        <td
                          key={`blank-${cell}`}
                          className="bg-muted/30 h-24 border"
                        />
                      );
                    const list = byDay.get(key) ?? [];
                    return (
                      <td
                        key={key}
                        className="h-24 border p-1 align-top"
                        aria-current={key === today ? "date" : undefined}
                      >
                        <span
                          className={
                            key === today
                              ? "bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full font-medium"
                              : "font-medium"
                          }
                        >
                          {Number(key.slice(8))}
                        </span>
                        <ul className="mt-1 space-y-1">
                          {list.slice(0, 3).map((entry) => (
                            <li
                              key={entry.id}
                              title={`${KIND_LABELS[entry.kind]}: ${entry.title}`}
                              className={`truncate border-l-2 pl-1 ${KIND_STYLES[entry.kind]}`}
                            >
                              <span className="sr-only">
                                {KIND_LABELS[entry.kind]}:{" "}
                              </span>
                              {entry.title}
                            </li>
                          ))}
                          {list.length > 3 ? (
                            <li className="text-muted-foreground">
                              +{list.length - 3} more
                            </li>
                          ) : null}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
