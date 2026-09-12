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
  ProjectsRequestError,
  getProject,
  listAssignableEvents,
  listAssignableTeams,
  listAssignableUsers,
  listProjects,
} from "../api/projects-gateway";
import { projectKeys, useProjectsMutations } from "../api/projects-queries";
import { projectAbilities } from "../lib/project-access";
import type { ProjectStatus } from "../lib/projects-types";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectDetailDialog } from "./project-detail-dialog";
import { ProjectFilters } from "./project-filters";
import { ProjectsTable } from "./projects-table";

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

export function ProjectsManager({ access }: { access: CurrentAccess }) {
  const keys = projectKeys(access);
  const client = useQueryClient();
  const abilities = projectAbilities(access);

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    status: statusFilter,
    search: debouncedSearch.trim() || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listProjects(listParams, signal),
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

  const eventsQuery = useQuery({
    queryKey: keys.events,
    queryFn: ({ signal }) => listAssignableEvents(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canCreate || abilities.canUpdate,
  });

  const mutations = useProjectsMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof ProjectsRequestError &&
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
  const filtersActive = statusFilter !== null || search.trim() !== "";

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
        <p role="status">Loading projects…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching project${total === 1 ? "" : "s"}`
                : `${total} project${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New project
              </Button>
            ) : null}
          </div>

          <ProjectFilters
            status={statusFilter}
            search={search}
            onStatusChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />

          <ProjectsTable
            projects={rows}
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
        <CreateProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          managers={users}
          events={events}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setStatusFilter(null);
            setPage(1);
            setAnnouncement("Project created.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <ProjectDetailDialog
        projectId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={users}
        teams={teams}
        events={events}
        canUpdate={abilities.canUpdate}
        canTransition={abilities.canTransition}
        canAssign={abilities.canAssign}
        canDelete={abilities.canDelete}
        getProject={getProject}
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
        onDelete={mutations.remove.mutateAsync}
        onChanged={() => void listQuery.refetch()}
        onDeleted={() => {
          setSelectedId(null);
          setAnnouncement("Project deleted.");
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
