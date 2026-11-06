"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { useUrlState } from "@/features/navigation/hooks/use-url-state";
import {
  enumCodec,
  nullableEnumCodec,
  positiveIntCodec,
  stringCodec,
} from "@/features/navigation/lib/url-state";

import {
  EventsRequestError,
  getEventSummary,
  listAssignableTeams,
  listAssignableUsers,
  listEvents,
} from "../api/events-gateway";
import { eventKeys, useEventsMutations } from "../api/events-queries";
import { eventAbilities } from "../lib/event-access";
import { rememberEventsListing } from "../lib/event-workspace";
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  type EventSortField,
  type EventStatus,
  type EventType,
} from "../lib/events-types";
import { CreateEventDialog } from "./create-event-dialog";
import { EventFilters } from "./event-filters";
import { EventSummaryTiles } from "./events-summary-tiles";
import { EventsTable, type EventSort } from "./events-table";

const PAGE_SIZE = 10;
const STATUS_CODEC = nullableEnumCodec(EVENT_STATUSES);
const TYPE_CODEC = nullableEnumCodec(EVENT_TYPES);
const SORT_CODEC = enumCodec([
  "createdAt",
  "name",
  "startAt",
  "status",
] as const);
const DIRECTION_CODEC = enumCodec(["asc", "desc"] as const);
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

  // The filters live in the URL, so returning from a workspace restores them.
  const urlParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useUrlState<EventStatus | null>(
    "status",
    null,
    STATUS_CODEC,
    urlParams.get("status"),
  );
  const [typeFilter, setTypeFilter] = useUrlState<EventType | null>(
    "type",
    null,
    TYPE_CODEC,
    urlParams.get("type"),
  );
  const [search, setSearch] = useUrlState<string>(
    "search",
    "",
    stringCodec,
    urlParams.get("search"),
  );
  const [sortField, setSortField] = useUrlState<EventSortField>(
    "sort",
    "createdAt",
    SORT_CODEC,
    urlParams.get("sort"),
  );
  const [sortDirection, setSortDirection] = useUrlState<"asc" | "desc">(
    "direction",
    "asc",
    DIRECTION_CODEC,
    urlParams.get("direction"),
  );
  const [page, setPage] = useUrlState<number>(
    "page",
    1,
    positiveIntCodec,
    urlParams.get("page"),
  );
  const sort: EventSort = { field: sortField, direction: sortDirection };
  const listingQuery = urlParams.toString();
  useEffect(() => rememberEventsListing(listingQuery), [listingQuery]);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    status: statusFilter,
    eventType: typeFilter,
    search: debouncedSearch.trim() || null,
    sort: sort.field,
    direction: sort.direction,
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

  const summaryQuery = useQuery({
    queryKey: keys.summary,
    queryFn: ({ signal }) => getEventSummary(signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const usersQuery = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listAssignableUsers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canCreate,
  });

  const teamsQuery = useQuery({
    queryKey: keys.teams,
    queryFn: ({ signal }) => listAssignableTeams(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canCreate && abilities.canAssignTeams,
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
          <div
            data-work-toolbar
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching event${total === 1 ? "" : "s"}`
                : `${total} event${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                Create event
              </Button>
            ) : null}
          </div>

          <EventSummaryTiles
            summary={summaryQuery.data}
            loading={summaryQuery.isPending}
          />

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
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            filtered={filtersActive}
            sort={sort}
            onSortChange={(next) => {
              setSortField(next.field);
              setSortDirection(next.direction);
              setPage(1);
            }}
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
          teams={teams}
          canAssignTeams={abilities.canAssignTeams}
          canUpdateBudget={abilities.canUpdateBudget}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setStatusFilter(null);
            setTypeFilter(null);
            setPage(1);
            setAnnouncement("Event created.");
            void listQuery.refetch();
            void summaryQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
