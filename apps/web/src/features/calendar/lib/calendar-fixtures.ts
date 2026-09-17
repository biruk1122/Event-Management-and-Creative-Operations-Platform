import { addDays, startOfDay } from "./calendar-date";
import type { CalendarEntry } from "./calendar-types";

/** Demo data only, anchored to today so the calendar always shows something
 * relevant regardless of when it is opened. CAL-05 replaces every caller of
 * this with the real feed from the API. */
export function calendarFixtures(): CalendarEntry[] {
  const today = startOfDay(new Date());
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const day = addDays(today, dayOffset);
    day.setHours(hour, minute, 0, 0);
    return day.toISOString();
  };

  return [
    {
      id: "fixture-event-1",
      title: "Q4 launch event",
      description: "Venue walkthrough and vendor sign-off.",
      type: "EVENT",
      startAt: at(1, 10),
      endAt: at(1, 12),
      eventId: "fixture-event-record-1",
      taskId: null,
      projectId: null,
      createdAt: at(-3, 9),
      updatedAt: at(-3, 9),
    },
    {
      id: "fixture-task-1",
      title: "Confirm catering headcount",
      description: null,
      type: "TASK",
      startAt: at(2, 9),
      endAt: null,
      eventId: null,
      taskId: "fixture-task-record-1",
      projectId: null,
      createdAt: at(-2, 14),
      updatedAt: at(-2, 14),
    },
    {
      id: "fixture-project-1",
      title: "Brand refresh deliverable due",
      description: null,
      type: "PROJECT",
      startAt: at(4, 17),
      endAt: null,
      eventId: null,
      taskId: null,
      projectId: "fixture-project-record-1",
      createdAt: at(-5, 11),
      updatedAt: at(-5, 11),
    },
    {
      id: "fixture-personal-1",
      title: "Dentist appointment",
      description: null,
      type: "PERSONAL",
      startAt: at(0, 15, 30),
      endAt: at(0, 16, 30),
      eventId: null,
      taskId: null,
      projectId: null,
      createdAt: at(-1, 8),
      updatedAt: at(-1, 8),
    },
    {
      id: "fixture-reminder-1",
      title: "Renew venue insurance",
      description: "Policy lapses at the end of the month.",
      type: "REMINDER",
      startAt: at(6, 9),
      endAt: null,
      eventId: null,
      taskId: null,
      projectId: null,
      createdAt: at(-4, 10),
      updatedAt: at(-4, 10),
    },
  ];
}
