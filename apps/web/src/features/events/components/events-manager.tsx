"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { assignEventManager as defaultAssignManager } from "../api/assign-event-manager";
import { assignEventTeam as defaultAssignTeam } from "../api/assign-event-team";
import { createEvent as defaultCreateEvent } from "../api/create-event";
import { deleteEvent as defaultDeleteEvent } from "../api/delete-event";
import { getEvent as defaultGetEvent } from "../api/get-event";
import { getEventBudget as defaultGetBudget } from "../api/get-event-budget";
import { removeEventTeam as defaultRemoveTeam } from "../api/remove-event-team";
import { setEventBudget as defaultSetBudget } from "../api/set-event-budget";
import { transitionEvent as defaultTransition } from "../api/transition-event";
import { updateEvent as defaultUpdateEvent } from "../api/update-event";
import { CreateEventDialog } from "./create-event-dialog";
import { EventDetailDialog } from "./event-detail-dialog";
import { EventFilters } from "./event-filters";
import { EventsTable } from "./events-table";
import type {
  AssignEventManager,
  AssignEventTeam,
  CreateEvent,
  DeleteEvent,
  GetEvent,
  GetEventBudget,
  RemoveEventTeam,
  SetEventBudget,
  TransitionEvent,
  UpdateEvent,
} from "../lib/events-outcome";
import {
  type AssignableTeam,
  type AssignableUser,
  type Event,
  type EventStatus,
  type EventType,
  type PaginatedEvents,
} from "../lib/events-types";

const PAGE_SIZE = 10;

interface EventsManagerProps {
  initialPage: PaginatedEvents;
  assignableUsers: readonly AssignableUser[];
  assignableTeams: readonly AssignableTeam[];
  createEvent?: CreateEvent;
  updateEvent?: UpdateEvent;
  transitionEvent?: TransitionEvent;
  assignManager?: AssignEventManager;
  assignTeam?: AssignEventTeam;
  removeTeam?: RemoveEventTeam;
  setBudget?: SetEventBudget;
  deleteEvent?: DeleteEvent;
  getEvent?: GetEvent;
  getBudget?: GetEventBudget;
}

export function EventsManager({
  initialPage,
  assignableUsers,
  assignableTeams,
  createEvent = defaultCreateEvent,
  updateEvent = defaultUpdateEvent,
  transitionEvent = defaultTransition,
  assignManager = defaultAssignManager,
  assignTeam = defaultAssignTeam,
  removeTeam = defaultRemoveTeam,
  setBudget = defaultSetBudget,
  deleteEvent = defaultDeleteEvent,
  getEvent = defaultGetEvent,
  getBudget = defaultGetBudget,
}: EventsManagerProps) {
  const [events, setEvents] = useState<Event[]>([...initialPage.items]);
  const [statusFilter, setStatusFilter] = useState<EventStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (statusFilter && event.status !== statusFilter) return false;
      if (typeFilter && event.eventType !== typeFilter) return false;
      if (term === "") return true;
      return event.name.toLowerCase().includes(term);
    });
  }, [events, statusFilter, typeFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filtersActive =
    statusFilter !== null || typeFilter !== null || search.trim() !== "";

  function upsert(next: Event) {
    setEvents((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  function remove(id: string) {
    setEvents((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
    setAnnouncement("Event deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {filtered.length} event{filtered.length === 1 ? "" : "s"}
          {filtersActive ? " match these filters" : ""}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New event
        </Button>
      </div>

      <EventFilters
        status={statusFilter}
        eventType={typeFilter}
        search={search}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onTypeChange={(value) => {
          setTypeFilter(value);
          setPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      <EventsTable
        events={visible}
        onSelect={setSelectedId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={filtersActive}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        managers={assignableUsers}
        onCreate={createEvent}
        onCreated={(event) => {
          upsert(event);
          setStatusFilter(null);
          setTypeFilter(null);
          setSearch("");
          setPage(1);
          setAnnouncement("Event created.");
        }}
      />

      <EventDetailDialog
        eventId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={assignableUsers}
        teams={assignableTeams}
        getEvent={getEvent}
        getBudget={getBudget}
        onUpdate={updateEvent}
        onTransition={transitionEvent}
        onAssignManager={assignManager}
        onAssignTeam={assignTeam}
        onRemoveTeam={removeTeam}
        onSetBudget={setBudget}
        onDelete={deleteEvent}
        onChanged={upsert}
        onDeleted={remove}
      />
    </div>
  );
}
