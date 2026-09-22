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
  getTalent,
  listAssignableEvents,
  listAssignableUsers,
  listTalents,
  TalentRequestError,
} from "../api/talent-gateway";
import { talentKeys, useTalentMutations } from "../api/talent-queries";
import { talentAbilities } from "../lib/talent-access";
import type { TalentAvailability, TalentType } from "../lib/talent-types";
import { CreateTalentDialog } from "./create-talent-dialog";
import { TalentDetailDialog } from "./talent-detail-dialog";
import { TalentFilters } from "./talent-filters";
import { TalentTable } from "./talent-table";

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

export function TalentManager({ access }: { access: CurrentAccess }) {
  const keys = talentKeys(access);
  const client = useQueryClient();
  const abilities = talentAbilities(access);

  const [typeFilter, setTypeFilter] = useState<TalentType | null>(null);
  const [availabilityFilter, setAvailabilityFilter] =
    useState<TalentAvailability | null>(null);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    type: typeFilter,
    availability: availabilityFilter,
    managerId: managerFilter,
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

  const usersQuery = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listAssignableUsers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canCreate || abilities.canUpdate,
  });

  const eventsQuery = useQuery({
    queryKey: keys.events,
    queryFn: ({ signal }) => listAssignableEvents(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canAssign,
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
    search.trim() !== "";

  const users = usersQuery.data ?? [];
  const events = eventsQuery.data ?? [];

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching talent${total === 1 ? "" : "s"}`
                : `${total} talent${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New talent
              </Button>
            ) : null}
          </div>

          <TalentFilters
            type={typeFilter}
            availability={availabilityFilter}
            managerId={managerFilter}
            search={search}
            managers={users}
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
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />

          <TalentTable
            talents={rows}
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
        <CreateTalentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          managers={users}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setTypeFilter(null);
            setAvailabilityFilter(null);
            setManagerFilter(null);
            setPage(1);
            setAnnouncement("Talent created.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <TalentDetailDialog
        talentId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={users}
        events={events}
        abilities={abilities}
        getTalent={getTalent}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onTransition={(id, availability) =>
          mutations.transition.mutateAsync({ id, availability })
        }
        onSetManager={(id, managerId) =>
          mutations.setManager.mutateAsync({ id, managerId })
        }
        onAddSocialLink={(talentId, values) =>
          mutations.addSocialLink.mutateAsync({ talentId, values })
        }
        onRemoveSocialLink={(talentId, socialLinkId) =>
          mutations.removeSocialLink.mutateAsync({ talentId, socialLinkId })
        }
        onAddSchedule={(talentId, values) =>
          mutations.addSchedule.mutateAsync({ talentId, values })
        }
        onUpdateSchedule={(talentId, scheduleId, values) =>
          mutations.updateSchedule.mutateAsync({ talentId, scheduleId, values })
        }
        onRemoveSchedule={(talentId, scheduleId) =>
          mutations.removeSchedule.mutateAsync({ talentId, scheduleId })
        }
        onAssignEvent={(talentId, values) =>
          mutations.assignEvent.mutateAsync({ talentId, values })
        }
        onTransitionAssignment={(talentId, assignmentId, status) =>
          mutations.transitionAssignment.mutateAsync({
            talentId,
            assignmentId,
            status,
          })
        }
        onChanged={() => void listQuery.refetch()}
      />
    </div>
  );
}
