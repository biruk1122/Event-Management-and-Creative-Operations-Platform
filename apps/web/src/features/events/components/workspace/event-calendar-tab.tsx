"use client";

import { useQuery } from "@tanstack/react-query";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { listEventMeetings } from "@/features/meetings/api/meetings-gateway";
import { listTasks } from "@/features/tasks/api/tasks-gateway";
import { dateLabel } from "@/features/tasks/lib/tasks-types";
import { formatInZone } from "@/lib/app-timezone";

import { listEventMilestones } from "../../api/events-gateway";
import { eventKeys } from "../../api/events-queries";
import { buildAgenda, type AgendaItem } from "../../lib/event-agenda";
import { useEventWorkspace } from "./event-workspace-shell";

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";
const KIND_LABEL: Record<AgendaItem["kind"], string> = {
  milestone: "Milestone",
  meeting: "Meeting",
  task: "Task due",
};

function when(item: AgendaItem): string {
  if (item.allDay) return dateLabel(item.at);
  return formatInZone(item.at, { dateStyle: "medium", timeStyle: "short" });
}

/** The event's dated items in one list: milestones, meetings and task due dates. */
export function EventCalendarTab() {
  const { event, access } = useEventWorkspace();
  const keys = eventKeys(access);

  const agenda = useQuery({
    queryKey: [...keys.all, "event", event.id, "calendar"],
    queryFn: async ({ signal }) => {
      const [milestones, meetings, tasks] = await Promise.all([
        listEventMilestones(event.id, signal),
        listEventMeetings(event.workspaceId, signal),
        listTasks({ relatedEventId: event.id, pageSize: 100 }, signal),
      ]);
      return buildAgenda({
        milestones,
        meetings,
        tasks: tasks.items,
      });
    },
  });

  return (
    <section className={CARD} aria-labelledby="event-calendar-heading">
      <div>
        <h3 id="event-calendar-heading" className="text-lg font-semibold">
          Calendar
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Milestones, meetings and task due dates for this event, in order.
        </p>
      </div>

      <div className="mt-6">
        {agenda.isPending ? (
          <p className="text-muted-foreground text-sm">Loading calendar…</p>
        ) : agenda.isError ? (
          <Alert variant="destructive">
            <AlertTitle>
              The calendar could not be loaded. Try again.
            </AlertTitle>
          </Alert>
        ) : agenda.data.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">Nothing scheduled yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Add milestones, schedule meetings or set task due dates to see
              them here.
            </p>
          </div>
        ) : (
          <ol className="grid gap-3">
            {agenda.data.map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {when(item)}
                  </p>
                </div>
                <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
