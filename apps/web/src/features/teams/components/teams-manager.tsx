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
  getTeam,
  listAssignableDepartments,
  listAssignableManagers,
  listTeams,
  TeamsRequestError,
} from "../api/teams-gateway";
import { teamKeys, useTeamsMutations } from "../api/teams-queries";
import { CreateTeamDialog } from "./create-team-dialog";
import { TeamDetailDialog } from "./team-detail-dialog";
import { TeamFilters } from "./team-filters";
import { TeamsTable } from "./teams-table";
import type { TeamActivity } from "../lib/teams-types";

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

export function TeamsManager({ access }: { access: CurrentAccess }) {
  const keys = teamKeys(access);
  const client = useQueryClient();
  const can = (permission: string) =>
    access.grants.some(
      (grant) =>
        grant.permissionKey === permission && grant.scope === "ORGANIZATION",
    );
  const canCreate = can("team.create");
  const canEdit = can("team.update");
  const canAssignManager = can("team.assign_manager");
  const canManageMembers = can("team.manage_members");
  const canDelete = can("team.delete");

  const [statusFilter, setStatusFilter] = useState<TeamActivity | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    status: statusFilter,
    search: debouncedSearch.trim(),
    departmentId: departmentFilter,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listTeams(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const managersQuery = useQuery({
    queryKey: keys.managers,
    queryFn: ({ signal }) => listAssignableManagers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: canCreate || canEdit || canAssignManager || canManageMembers,
  });

  // Always loaded: the create dialog needs it to offer an owning department,
  // and every reader needs it to populate the "filter by department" control.
  // Resolves to the caller's own department for a department-scoped reader.
  const departmentsQuery = useQuery({
    queryKey: keys.departments,
    queryFn: ({ signal }) => listAssignableDepartments(signal),
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useTeamsMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof TeamsRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const teams = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive =
    statusFilter !== null ||
    departmentFilter !== null ||
    debouncedSearch.trim() !== "";
  const managers = managersQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];

  function resetToFirstPage() {
    setPage(1);
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
        <p role="status">Loading teams…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {total} team{total === 1 ? "" : "s"}
              {filtersActive ? " match these filters" : ""}
            </p>
            {canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New team
              </Button>
            ) : null}
          </div>

          <TeamFilters
            status={statusFilter}
            departmentId={departmentFilter}
            search={search}
            departments={departments}
            onStatusChange={(value) => {
              setStatusFilter(value);
              resetToFirstPage();
            }}
            onDepartmentChange={(value) => {
              setDepartmentFilter(value);
              resetToFirstPage();
            }}
            onSearchChange={(value) => {
              setSearch(value);
              resetToFirstPage();
            }}
          />

          <TeamsTable
            teams={teams}
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

      {canCreate ? (
        <CreateTeamDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          departments={departments}
          managers={managers}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setStatusFilter(null);
            setDepartmentFilter(null);
            setSearch("");
            setPage(1);
            setAnnouncement("Team created.");
          }}
        />
      ) : null}

      <TeamDetailDialog
        teamId={selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        managers={managers}
        canEdit={canEdit}
        canAssignManager={canAssignManager}
        canManageMembers={canManageMembers}
        canDelete={canDelete}
        getTeam={getTeam}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onAssignManager={(id, managerId) =>
          mutations.assignManager.mutateAsync({ id, managerId })
        }
        onAddMember={(id, userId) =>
          mutations.addMember.mutateAsync({ id, userId })
        }
        onRemoveMember={(id, userId) =>
          mutations.removeMember.mutateAsync({ id, userId })
        }
        onDeactivate={mutations.deactivate.mutateAsync}
        onReactivate={mutations.reactivate.mutateAsync}
        onDelete={mutations.remove.mutateAsync}
        onChanged={() => void listQuery.refetch()}
        onDeleted={() => {
          setSelectedId(null);
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
