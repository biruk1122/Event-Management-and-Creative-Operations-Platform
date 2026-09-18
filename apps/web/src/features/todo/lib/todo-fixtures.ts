import { addDaysToDateOnly, todayDateOnly } from "./todo-date";
import type { RelatedOption, TodoItem } from "./todo-types";

/** Demo data only, anchored to today so the list always shows something
 * relevant across every smart view regardless of when it is opened.
 * TODO-05 replaces every caller of this with the real feed from the API. */
export function todoFixtures(): TodoItem[] {
  const today = todayDateOnly();
  const at = (offset: number) => addDaysToDateOnly(today, offset);
  const now = new Date().toISOString();

  return [
    {
      id: "fixture-todo-1",
      title: "Confirm venue availability",
      description: "Call the venue manager to confirm the October date.",
      type: "WORK",
      priority: "HIGH",
      status: "NOT_STARTED",
      dueDate: today,
      dueTime: "09:00:00",
      relatedEventId: "fixture-event-1",
      relatedProjectId: null,
      reminderEnabled: true,
      reminderAt: `${today}T08:00:00.000Z`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fixture-todo-2",
      title: "Renew venue insurance",
      description: "Policy lapses at the end of the month.",
      type: "REMINDER",
      priority: "MEDIUM",
      status: "NOT_STARTED",
      dueDate: at(3),
      dueTime: null,
      relatedEventId: null,
      relatedProjectId: null,
      reminderEnabled: false,
      reminderAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fixture-todo-3",
      title: "Call mom",
      description: null,
      type: "PERSONAL",
      priority: "LOW",
      status: "NOT_STARTED",
      dueDate: today,
      dueTime: null,
      relatedEventId: null,
      relatedProjectId: null,
      reminderEnabled: false,
      reminderAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fixture-todo-4",
      title: "Draft campaign brief",
      description: "Cover goals, audience, and budget guardrails.",
      type: "WORK",
      priority: "URGENT",
      status: "IN_PROGRESS",
      dueDate: at(1),
      dueTime: "17:00:00",
      relatedEventId: null,
      relatedProjectId: "fixture-project-1",
      reminderEnabled: false,
      reminderAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fixture-todo-5",
      title: "Buy anniversary gift",
      description: null,
      type: "PERSONAL",
      priority: "HIGH",
      status: "NOT_STARTED",
      dueDate: at(5),
      dueTime: null,
      relatedEventId: null,
      relatedProjectId: null,
      reminderEnabled: true,
      reminderAt: `${at(4)}T12:00:00.000Z`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fixture-todo-6",
      title: "Book photographer",
      description: null,
      type: "QUICK_NOTE",
      priority: "MEDIUM",
      status: "COMPLETED",
      dueDate: at(-1),
      dueTime: null,
      relatedEventId: "fixture-event-1",
      relatedProjectId: null,
      reminderEnabled: false,
      reminderAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fixture-todo-7",
      title: "Follow up with sponsor",
      description: "Check whether they need anything else before signing.",
      type: "FOLLOW_UP",
      priority: "MEDIUM",
      status: "NOT_STARTED",
      dueDate: null,
      dueTime: null,
      relatedEventId: null,
      relatedProjectId: null,
      reminderEnabled: false,
      reminderAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function todoRelatedEventOptions(): RelatedOption[] {
  return [
    { id: "fixture-event-1", name: "Q4 launch event" },
    { id: "fixture-event-2", name: "Spring gala" },
  ];
}

export function todoRelatedProjectOptions(): RelatedOption[] {
  return [
    { id: "fixture-project-1", name: "Brand refresh" },
    { id: "fixture-project-2", name: "Venue renovation" },
  ];
}
