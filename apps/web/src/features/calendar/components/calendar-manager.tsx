"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useRealtimeConnection,
  type ConnectRealtime,
} from "@/features/realtime";

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
import { CalendarRequestError } from "../api/calendar-gateway";
import {
  calendarKeys,
  useCalendarMutations,
  useCalendarRange,
} from "../api/calendar-queries";
import {
  addDays,
  addMonths,
  rangeForView,
  startOfDay,
} from "../lib/calendar-date";
import type { DeleteCalendarEntryOutcome } from "../lib/calendar-outcome";
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
  access: CurrentAccess;
  /** Testing seam, mirroring `NotificationsManagerProps.connect`; defaults to
   * the real `/realtime` handshake. */
  connect?: ConnectRealtime;
  /** Testing seam: the default anchor is "today", which would make
   * assertions on the rendered range non-deterministic. */
  initialAnchor?: Date;
}

export function CalendarManager({
  access,
  connect,
  initialAnchor,
}: CalendarManagerProps) {
  const client = useQueryClient();
  const keys = calendarKeys(access);

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

  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  const rangeParams = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range.from, range.to],
  );

  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.all });
  }, [client, keys.all]);

  // The backend has no calendar-specific live event today (only
  // `notification.invalidated` exists anywhere in this app), so there is no
  // frame worth matching here - only a reconnect's own REST refetch below is
  // authoritative for "something may have changed while disconnected."
  const connection = useRealtimeConnection(connect);

  const everConnectedRef = useRef(false);
  useEffect(() => {
    if (connection.state.status === "connected") {
      if (everConnectedRef.current) reconcile();
      everConnectedRef.current = true;
    }
  }, [connection.state.status, reconcile]);

  const feed = useCalendarRange(access, rangeParams);
  const mutations = useCalendarMutations(access);

  useEffect(() => {
    if (
      feed.error instanceof CalendarRequestError &&
      (feed.error.status === 401 || feed.error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [feed.error, client]);

  const entries = useMemo(() => feed.data ?? [], [feed.data]);
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
    if (editingEntry) {
      return mutations.update.mutateAsync({ id: editingEntry.id, values });
    }
    return mutations.create.mutateAsync(values);
  }

  async function deleteEntry(id: string): Promise<DeleteCalendarEntryOutcome> {
    return mutations.remove.mutateAsync(id);
  }

  if (feed.isPending) {
    return <p role="status">Loading your calendar…</p>;
  }

  if (feed.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {feed.error instanceof CalendarRequestError
            ? feed.error.message
            : "We could not load your calendar. Try again."}
        </p>
        <Button variant="outline" onClick={() => void feed.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connection.state.status === "denied" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Live updates are unavailable. Refresh to see changes made elsewhere.
        </p>
      ) : connection.state.status === "reconnecting" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Reconnecting…
        </p>
      ) : null}

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
