"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  getTalentSummary,
  listAssignableUsers,
  listTalents,
  TalentRequestError,
  uploadTalentPhoto,
} from "../api/talent-gateway";
import { talentKeys, useTalentMutations } from "../api/talent-queries";
import { talentAbilities } from "../lib/talent-access";
import {
  TALENT_AVAILABILITIES,
  TALENT_TYPES,
  type TalentAssignmentFilter,
  type TalentAvailability,
  type TalentSort,
  type TalentType,
} from "../lib/talent-types";
import { CreateTalentDialog } from "./create-talent-dialog";
import { useUrlState } from "@/features/navigation/hooks/use-url-state";
import {
  enumCodec,
  nullableEnumCodec,
  nullableStringCodec,
  positiveIntCodec,
  stringCodec,
} from "@/features/navigation/lib/url-state";
import { TalentCardGrid } from "./talent-card-grid";
import { TalentFilters } from "./talent-filters";
import { TalentSummaryTiles } from "./talent-summary-tiles";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const TYPE_CODEC = nullableEnumCodec(TALENT_TYPES);
const AVAILABILITY_CODEC = nullableEnumCodec(TALENT_AVAILABILITIES);
const ASSIGNMENT_CODEC = nullableEnumCodec(["assigned", "unassigned"] as const);
const SORT_CODEC = enumCodec(["name", "newest", "availability"] as const);

export function TalentManager({ access }: { access: CurrentAccess }) {
  const keys = talentKeys(access);
  const client = useQueryClient();
  const abilities = talentAbilities(access);

  // The filters live in the URL, so a visit to a profile and back restores them.
  const query = useSearchParams();
  const [typeFilter, setTypeFilter] = useUrlState<TalentType | null>(
    "type",
    null,
    TYPE_CODEC,
    query.get("type"),
  );
  const [availabilityFilter, setAvailabilityFilter] =
    useUrlState<TalentAvailability | null>(
      "availability",
      null,
      AVAILABILITY_CODEC,
      query.get("availability"),
    );
  const [managerFilter, setManagerFilter] = useUrlState<string | null>(
    "manager",
    null,
    nullableStringCodec,
    query.get("manager"),
  );
  const [assignmentFilter, setAssignmentFilter] =
    useUrlState<TalentAssignmentFilter | null>(
      "assignment",
      null,
      ASSIGNMENT_CODEC,
      query.get("assignment"),
    );
  const [sort, setSort] = useUrlState<TalentSort>(
    "sort",
    "name",
    SORT_CODEC,
    query.get("sort"),
  );
  const [search, setSearch] = useUrlState<string>(
    "search",
    "",
    stringCodec,
    query.get("search"),
  );
  const [page, setPage] = useUrlState<number>(
    "page",
    1,
    positiveIntCodec,
    query.get("page"),
  );
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    type: typeFilter,
    availability: availabilityFilter,
    managerId: managerFilter,
    assignment: assignmentFilter,
    sort,
    search: debouncedSearch.trim() || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listTalents(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const summaryQuery = useQuery({
    queryKey: keys.summary,
    queryFn: ({ signal }) => getTalentSummary(signal),
    retry: false,
    staleTime: 30_000,
  });

  const usersQuery = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listAssignableUsers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canCreate || abilities.canUpdate,
  });

  const mutations = useTalentMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof TalentRequestError &&
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
    typeFilter !== null ||
    availabilityFilter !== null ||
    managerFilter !== null ||
    assignmentFilter !== null ||
    search.trim() !== "";

  const users = usersQuery.data ?? [];

  function refreshDirectory() {
    void listQuery.refetch();
    void summaryQuery.refetch();
  }

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
        <p role="status">Loading talent…</p>
      ) : listQuery.isError ? null : (
        <>
          <TalentSummaryTiles
            summary={summaryQuery.data ?? undefined}
            pending={summaryQuery.isPending}
          />

          <TalentFilters
            type={typeFilter}
            availability={availabilityFilter}
            managerId={managerFilter}
            assignment={assignmentFilter}
            sort={sort}
            search={search}
            managers={users}
            action={
              abilities.canCreate ? (
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden="true" data-icon="inline-start" />
                  Add talent
                </Button>
              ) : null
            }
            onTypeChange={(value) => {
              setTypeFilter(value);
              setPage(1);
            }}
            onAvailabilityChange={(value) => {
              setAvailabilityFilter(value);
              setPage(1);
            }}
            onManagerChange={(value) => {
              setManagerFilter(value);
              setPage(1);
            }}
            onAssignmentChange={(value) => {
              setAssignmentFilter(value);
              setPage(1);
            }}
            onSortChange={(value) => {
              setSort(value);
              setPage(1);
            }}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />

          <TalentCardGrid
            talents={rows}
            total={total}
            pageSize={PAGE_SIZE}
            canAssign={abilities.canAssign}
            onSelect={(id) => router.push(`/talent/${id}`)}
            onAssign={(id) => router.push(`/talent/${id}?assign=1`)}
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
        <CreateTalentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          managers={users}
          onCreate={mutations.create.mutateAsync}
          onUploadPhoto={async (talentId, file) => {
            try {
              await uploadTalentPhoto(talentId, file);
              return true;
            } catch {
              return false;
            }
          }}
          onCreated={(_talent, notice) => {
            setSearch("");
            setTypeFilter(null);
            setAvailabilityFilter(null);
            setManagerFilter(null);
            setAssignmentFilter(null);
            setPage(1);
            setAnnouncement(notice ?? "Talent created.");
            refreshDirectory();
          }}
        />
      ) : null}
    </div>
  );
}
