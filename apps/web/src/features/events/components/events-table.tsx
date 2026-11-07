import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatInZone } from "@/lib/app-timezone";
import { cn } from "@/lib/utils";

import {
  eventStatusLabel,
  eventTypeLabel,
  personName,
  type Event,
  type EventSortField,
  type EventStatus,
  type EventTeamSummary,
} from "../lib/events-types";
import { eventWorkspacePath } from "../lib/event-workspace";

export interface EventSort {
  field: EventSortField;
  direction: "asc" | "desc";
}

interface EventsTableProps {
  events: readonly Event[];
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
  sort: EventSort;
  onSortChange: (sort: EventSort) => void;
}

const STATUS_VARIANT: Record<
  EventStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PLANNING: "secondary",
  READY: "default",
  IN_PROGRESS: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

/** Team avatars shown before collapsing the rest into a "+N" chip. */
const TEAM_PREVIEW = 3;

function managerLabel(event: Event): string {
  return event.manager ? personName(event.manager) : "Unassigned";
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

function dateLabel(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return formatInZone(iso, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function progressFor(event: Event): {
  percent: number | null;
  summary: string;
} {
  const { completed, total } = event.progress;
  if (total === 0) return { percent: null, summary: "No linked tasks" };
  const percent = Math.round((completed / total) * 100);
  return { percent, summary: `${percent}%` };
}

function TeamAvatars({ teams }: { teams: readonly EventTeamSummary[] }) {
  if (teams.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  const shown = teams.slice(0, TEAM_PREVIEW);
  const hidden = teams.length - shown.length;
  return (
    <div
      role="group"
      className="flex items-center"
      aria-label={teams.map((t) => t.name).join(", ")}
    >
      {shown.map((team, index) => (
        <span
          key={team.id}
          title={team.name}
          className={cn(
            "bg-muted text-muted-foreground border-card flex size-7 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
            index > 0 && "-ml-2",
          )}
        >
          {initials(team.name)}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="bg-muted text-muted-foreground border-card -ml-2 flex h-7 items-center rounded-full border-2 px-2 text-[10px] font-semibold">
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}

function SortHeader({
  field,
  label,
  sort,
  onSortChange,
}: {
  field: EventSortField;
  label: string;
  sort: EventSort;
  onSortChange: (sort: EventSort) => void;
}) {
  const active = sort.field === field;
  const Icon = !active
    ? ArrowUpDown
    : sort.direction === "asc"
      ? ArrowUp
      : ArrowDown;
  const ariaSort = active
    ? sort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th scope="col" className="px-4 py-3 font-medium" aria-sort={ariaSort}>
      <button
        type="button"
        className="focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded focus-visible:ring-3 focus-visible:outline-none"
        onClick={() =>
          onSortChange({
            field,
            direction: active && sort.direction === "asc" ? "desc" : "asc",
          })
        }
      >
        {label}
        <Icon aria-hidden="true" className="size-3.5" />
      </button>
    </th>
  );
}

export function EventsTable({
  events,
  page,
  pageCount,
  onPageChange,
  filtered,
  sort,
  onSortChange,
}: EventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No events match these filters" : "No events yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the Create event button above to create the first one."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground bg-muted/40 border-border border-b text-xs">
            <tr>
              <SortHeader
                field="name"
                label="Event"
                sort={sort}
                onSortChange={onSortChange}
              />
              <SortHeader
                field="startAt"
                label="Date"
                sort={sort}
                onSortChange={onSortChange}
              />
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Teams
              </th>
              <SortHeader
                field="status"
                label="Status"
                sort={sort}
                onSortChange={onSortChange}
              />
              <th scope="col" className="px-4 py-3 font-medium">
                Progress
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {events.map((event) => {
              const progress = progressFor(event);
              return (
                <tr key={event.id} className="hover:bg-muted/50">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <Link
                      href={eventWorkspacePath(event.id)}
                      className="focus-visible:ring-ring/50 block rounded text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    >
                      {event.name}
                    </Link>
                    <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                      {eventTypeLabel(event.eventType)}
                      {event.location ? ` · ${event.location}` : ""}
                    </span>
                  </th>
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {dateLabel(event.startAt)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {managerLabel(event)}
                  </td>
                  <td className="px-4 py-3">
                    <TeamAvatars teams={event.teams} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[event.status]}>
                      {eventStatusLabel(event.status)}
                    </Badge>
                  </td>
                  <td className="w-40 px-4 py-3">
                    <ProgressBar
                      percent={progress.percent}
                      summary={progress.summary}
                      label={`Progress of ${event.name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {events.map((event) => {
          const progress = progressFor(event);
          return (
            <li key={event.id} className="border-border rounded-xl border p-4">
              <Link
                href={eventWorkspacePath(event.id)}
                className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              >
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {event.name}
                  <Badge variant={STATUS_VARIANT[event.status]}>
                    {eventStatusLabel(event.status)}
                  </Badge>
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {eventTypeLabel(event.eventType)} · {dateLabel(event.startAt)}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {managerLabel(event)}
                </span>
                <span className="mt-2 block">
                  <ProgressBar
                    percent={progress.percent}
                    summary={progress.summary}
                    label={`Progress of ${event.name}`}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Events pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
