/** One dated item on an event's calendar: a milestone, a meeting, or a task due date. */
export interface AgendaItem {
  id: string;
  kind: "milestone" | "meeting" | "task";
  title: string;
  /** A UTC instant. Milestones are date-only and sort at their day's start. */
  at: string;
  /** Whether `at` is a date only, with no time of day. */
  allDay: boolean;
}

export interface AgendaSources {
  milestones: readonly { id: string; name: string; dueDate: string }[];
  meetings: readonly { id: string; title: string; startAt: string }[];
  tasks: readonly { id: string; title: string; dueAt: string | null }[];
}

/**
 * Merges an event's dated items into one chronological agenda. Tasks without a
 * due date are left off, since they have no place on a calendar.
 */
export function buildAgenda(sources: AgendaSources): AgendaItem[] {
  const items: AgendaItem[] = [
    ...sources.milestones.map((milestone) => ({
      id: milestone.id,
      kind: "milestone" as const,
      title: milestone.name,
      at: `${milestone.dueDate}T00:00:00.000Z`,
      allDay: true,
    })),
    ...sources.meetings.map((meeting) => ({
      id: meeting.id,
      kind: "meeting" as const,
      title: meeting.title,
      at: meeting.startAt,
      allDay: false,
    })),
    ...sources.tasks.flatMap((task) =>
      task.dueAt
        ? [
            {
              id: task.id,
              kind: "task" as const,
              title: task.title,
              at: task.dueAt,
              allDay: false,
            },
          ]
        : [],
    ),
  ];
  return items.sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) || a.title.localeCompare(b.title),
  );
}
