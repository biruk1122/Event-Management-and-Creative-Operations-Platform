import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  eventStatusLabel,
  eventTypeLabel,
  personName,
  scheduleSummary,
  type Event,
  type EventStatus,
} from "../lib/events-types";

interface EventsTableProps {
  events: readonly Event[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
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

function managerLabel(event: Event): string {
  return event.manager ? personName(event.manager) : "Unassigned";
}

export function EventsTable({
  events,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
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
            : "Use the New event button above to create the first one."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Schedule
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(event.id)}
                  >
                    {event.name}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {eventTypeLabel(event.eventType)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[event.status]}>
                    {eventStatusLabel(event.status)}
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {scheduleSummary(event)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(event)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {events.map((event) => (
          <li key={event.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(event.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {event.name}
                <Badge variant={STATUS_VARIANT[event.status]}>
                  {eventStatusLabel(event.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {eventTypeLabel(event.eventType)} · {scheduleSummary(event)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(event)}
              </span>
            </button>
          </li>
        ))}
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
