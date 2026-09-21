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
  CampaignsRequestError,
  getCampaign,
  getCampaignBudget,
  listAssignableEvents,
  listAssignableTeams,
  listAssignableUsers,
  listCampaignActivities,
  listCampaigns,
} from "../api/campaigns-gateway";
import { campaignKeys, useCampaignsMutations } from "../api/campaigns-queries";
import { campaignAbilities } from "../lib/campaign-access";
import type { CampaignStatus, CampaignType } from "../lib/campaigns-types";
import { CampaignDetailDialog } from "./campaign-detail-dialog";
import { CampaignFilters } from "./campaign-filters";
import { CampaignsTable } from "./campaigns-table";
import { CreateCampaignDialog } from "./create-campaign-dialog";

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

export function CampaignsManager({ access }: { access: CurrentAccess }) {
  const keys = campaignKeys(access);
  const client = useQueryClient();
  const abilities = campaignAbilities(access);

  const [statusFilter, setStatusFilter] = useState<CampaignStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<CampaignType | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    status: statusFilter,
    campaignType: typeFilter,
    search: debouncedSearch.trim() || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listCampaigns(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const assignmentNeeded =
    abilities.canCreate || abilities.canUpdate || abilities.canAssign;

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
    enabled: abilities.canAssign,
  });

  // The related-event picker is needed to create or edit a campaign, and to
  // name the event of an existing campaign in its detail view.
  const eventsQuery = useQuery({
    queryKey: keys.events,
    queryFn: ({ signal }) => listAssignableEvents(signal),
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useCampaignsMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof CampaignsRequestError &&
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
        <p role="status">Loading campaigns…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching campaign${total === 1 ? "" : "s"}`
                : `${total} campaign${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New campaign
              </Button>
            ) : null}
          </div>

          <CampaignFilters
            status={statusFilter}
            campaignType={typeFilter}
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

          <CampaignsTable
            campaigns={rows}
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
        <CreateCampaignDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          managers={users}
          events={events}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setStatusFilter(null);
            setTypeFilter(null);
            setPage(1);
            setAnnouncement("Campaign created.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <CampaignDetailDialog
        campaignId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={users}
        teams={teams}
        events={events}
        abilities={abilities}
        getCampaign={getCampaign}
        getBudget={getCampaignBudget}
        listActivities={listCampaignActivities}
        onCreateActivity={(campaignId, values) =>
          mutations.createActivity.mutateAsync({ campaignId, values })
        }
        onUpdateActivity={(campaignId, activityId, values) =>
          mutations.updateActivity.mutateAsync({
            campaignId,
            activityId,
            values,
          })
        }
        onDeleteActivity={(campaignId, activityId) =>
          mutations.removeActivity.mutateAsync({ campaignId, activityId })
        }
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
          setAnnouncement("Campaign deleted.");
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
