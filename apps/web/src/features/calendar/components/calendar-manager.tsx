"use client";

import { useMemo, useState } from "react";

import { AgendaView } from "./agenda-view";
import { CalendarToolbar } from "./calendar-toolbar";
import { DayView } from "./day-view";
import { EntryDetailDialog } from "./entry-detail-dialog";
import {
  EntryDialog,
  type EntryFormOutcome,
  type EntryFormValues,
} from "./entry-dialog";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { addDays, addMonths, startOfDay } from "../lib/calendar-date";
import { calendarFixtures } from "../lib/calendar-fixtures";
import {
  CALENDAR_ENTRY_TYPES,
  isMutableCalendarEntryType,
  type CalendarEntry,
  type CalendarEntryType,
  type CalendarViewMode,
} from "../lib/calendar-types";

function nextAnchor(
  view: CalendarViewMode,
  anchor: Date,
  direction: "previous" | "next",
): Date {
  const sign = direction === "next" ? 1 : -1;
  if (view === "day") return addDays(anchor, sign);
  if (view === "week") return addDays(anchor, sign * 7);
  return addMonths(anchor, sign);
}

export interface CalendarManagerProps {
  /** Testing seam: the demo data is anchored to "today" by default, which
   * would make assertions on rendered content non-deterministic. */
  initialEntries?: CalendarEntry[];
  initialAnchor?: Date;
}

export function CalendarManager({
  initialEntries,
  initialAnchor,
}: CalendarManagerProps = {}) {
  const [entries, setEntries] = useState<CalendarEntry[]>(
    () => initialEntries ?? calendarFixtures(),
  );
  const [view, setView] = useState<CalendarViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(
    () => initialAnchor ?? startOfDay(new Date()),
  );
  const [activeTypes, setActiveTypes] = useState<Set<CalendarEntryType>>(
    () => new Set(CALENDAR_ENTRY_TYPES),
  );
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [detailEntry, setDetailEntry] = useState<CalendarEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createAt, setCreateAt] = useState<Date | null>(null);
  // EntryDialog's own form state only initializes once per mount; bumping
  // this on every open remounts it fresh instead of syncing it via an
  // effect (see that component's own doc comment).
  const [dialogInstanceKey, setDialogInstanceKey] = useState(0);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => activeTypes.has(entry.type)),
    [entries, activeTypes],
  );

  function openCreate(date: Date) {
    setEditingEntry(null);
    setCreateAt(date);
    setDialogOpen(true);
    setDialogInstanceKey((key) => key + 1);
  }

  function selectEntry(entry: CalendarEntry) {
    if (isMutableCalendarEntryType(entry.type)) {
      setEditingEntry(entry);
      setCreateAt(null);
      setDialogOpen(true);
      setDialogInstanceKey((key) => key + 1);
      return;
    }
    setDetailEntry(entry);
  }

  function toggleType(type: CalendarEntryType) {
    setActiveTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function navigate(direction: "previous" | "next" | "today") {
    setAnchor(
      direction === "today"
        ? startOfDay(new Date())
        : nextAnchor(view, anchor, direction),
    );
  }

  async function submitEntry(
    values: EntryFormValues,
  ): Promise<EntryFormOutcome> {
    const startAt = new Date(values.startAt).toISOString();
    const endAt = values.endAt ? new Date(values.endAt).toISOString() : null;

    if (editingEntry) {
      const updated: CalendarEntry = {
        ...editingEntry,
        title: values.title.trim(),
        description: values.description.trim() || null,
        type: values.type,
        startAt,
        endAt,
        updatedAt: new Date().toISOString(),
      };
      setEntries((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      return { status: "success", entry: updated };
    }

    const created: CalendarEntry = {
      id: `local-${crypto.randomUUID()}`,
      title: values.title.trim(),
      description: values.description.trim() || null,
      type: values.type,
      startAt,
      endAt,
      eventId: null,
      taskId: null,
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEntries((current) => [...current, created]);
    return { status: "success", entry: created };
  }

  async function deleteEntry(id: string): Promise<void> {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        anchor={anchor}
        activeTypes={activeTypes}
        onChangeView={setView}
        onNavigate={navigate}
        onToggleType={toggleType}
        onCreate={() => openCreate(anchor)}
      />

      {view === "month" ? (
        <MonthView
          anchor={anchor}
          entries={visibleEntries}
          onOpenDay={(date) => {
            setAnchor(date);
            setView("day");
          }}
          onCreateAt={openCreate}
          onSelectEntry={selectEntry}
        />
      ) : null}
      {view === "week" ? (
        <WeekView
          anchor={anchor}
          entries={visibleEntries}
          onCreateAt={openCreate}
          onSelectEntry={selectEntry}
        />
      ) : null}
      {view === "day" ? (
        <DayView
          anchor={anchor}
          entries={visibleEntries}
          onCreateAt={openCreate}
          onSelectEntry={selectEntry}
        />
      ) : null}
      {view === "agenda" ? (
        <AgendaView
          anchor={anchor}
          entries={visibleEntries}
          onSelectEntry={selectEntry}
        />
      ) : null}

      <EntryDialog
        key={dialogInstanceKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        initialStart={createAt}
        onSubmit={submitEntry}
        {...(editingEntry ? { onDelete: deleteEntry } : {})}
      />
      <EntryDetailDialog
        entry={detailEntry}
        onOpenChange={(open) => {
          if (!open) setDetailEntry(null);
        }}
      />
    </div>
  );
}
