"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  EventsRequestError,
  getEvent,
  getEventBudget,
  listAssignableTeams,
  listAssignableUsers,
  listEvents,
} from "../api/events-gateway";
import { eventKeys, useEventsMutations } from "../api/events-queries";
import { eventAbilities } from "../lib/event-access";
import type { EventStatus, EventType } from "../lib/events-types";
import { CreateEventDialog } from "./create-event-dialog";
import { EventDetailDialog } from "./event-detail-dialog";
import { EventFilters } from "./event-filters";
import { EventsTable } from "./events-table";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function EventsManager({ access }: { access: CurrentAccess }) {
  const keys = eventKeys(access);
  const client = useQueryClient();
  const abilities = eventAbilities(access);

  const [statusFilter, setStatusFilter] = useState<EventStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    status: statusFilter,
    eventType: typeFilter,
    search: debouncedSearch.trim() || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listEvents(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const assignmentNeeded =
    abilities.canCreate ||
    abilities.canUpdate ||
    abilities.canAssignManager ||
    abilities.canAssignTeams;

  const usersQuery = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listAssignableUsers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: assignmentNeeded,
  });

  const teamsQuery = useQuery({
    queryKey: keys.teams,
    queryFn: ({ signal }) => listAssignableTeams(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canAssignTeams,
  });

  const mutations = useEventsMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof EventsRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = data?.items ?? [];
  const filtersActive =
    statusFilter !== null || typeFilter !== null || search.trim() !== "";

  const users = usersQuery.data ?? [];
  const teams = teamsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {listQuery.isError ? (
        <div role="alert" className="space-y-2">
          <p>{(listQuery.error as Error).message}</p>
          <Button variant="outline" onClick={() => void listQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {listQuery.isPending ? (
        <p role="status">Loading events…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching event${total === 1 ? "" : "s"}`
                : `${total} event${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New event
              </Button>
            ) : null}
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
            events={rows}
            onSelect={setSelectedId}
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            filtered={filtersActive}
          />
        </>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {abilities.canCreate ? (
        <CreateEventDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          managers={users}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setStatusFilter(null);
            setTypeFilter(null);
            setPage(1);
            setAnnouncement("Event created.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <EventDetailDialog
        eventId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={users}
        teams={teams}
        canUpdate={abilities.canUpdate}
        canTransition={abilities.canTransition}
        canAssignManager={abilities.canAssignManager}
        canAssignTeams={abilities.canAssignTeams}
        canReadBudget={abilities.canReadBudget}
        canUpdateBudget={abilities.canUpdateBudget}
        canDelete={abilities.canDelete}
        getEvent={getEvent}
        getBudget={getEventBudget}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onTransition={(id, status) =>
          mutations.transition.mutateAsync({ id, status })
        }
        onAssignManager={(id, managerId) =>
          mutations.assignManager.mutateAsync({ id, managerId })
        }
        onAssignTeam={(id, teamId) =>
          mutations.assignTeam.mutateAsync({ id, teamId })
        }
        onRemoveTeam={(id, teamId) =>
          mutations.removeTeam.mutateAsync({ id, teamId })
        }
        onSetBudget={(id, amount, currency) =>
          mutations.setBudget.mutateAsync({ id, amount, currency })
        }
        onDelete={mutations.remove.mutateAsync}
        onChanged={() => void listQuery.refetch()}
        onDeleted={() => {
          setSelectedId(null);
          setAnnouncement("Event deleted.");
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
