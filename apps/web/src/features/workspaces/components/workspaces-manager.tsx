"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  getWorkspace,
  listAssignableTeams,
  listAssignableUsers,
  listWorkspaces,
  WorkspacesRequestError,
} from "../api/workspaces-gateway";
import {
  useWorkspacesMutations,
  workspaceKeys,
} from "../api/workspaces-queries";
import { abilitiesFor, readableKinds } from "../lib/workspace-access";
import { personName, type WorkspaceKind } from "../lib/workspaces-types";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { WorkspaceDetailDialog } from "./workspace-detail-dialog";
import { WorkspaceFilters } from "./workspace-filters";
import { WorkspacesTable } from "./workspaces-table";

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

export function WorkspacesManager({ access }: { access: CurrentAccess }) {
  const keys = workspaceKeys(access);
  const client = useQueryClient();
  const kinds = readableKinds(access);

  const [kind, setKind] = useState<WorkspaceKind>(kinds[0]!);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // If a grant change narrows the readable kinds under the caller, fall back
  // to the first still-readable kind rather than querying one they lost.
  const activeKind = kinds.includes(kind) ? kind : kinds[0]!;

  const abilities = abilitiesFor(access, activeKind);
  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = { kind: activeKind, page, pageSize: PAGE_SIZE };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listWorkspaces(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const assignmentNeeded =
    abilities.canCreate ||
    abilities.canAssignManager ||
    abilities.canAssignMembers;

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
    enabled: abilities.canAssignMembers,
  });

  const mutations = useWorkspacesMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof WorkspacesRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  // The API has no free-text search, so the manager term filters the current
  // page in the browser; the count line reflects that.
  const term = debouncedSearch.trim().toLowerCase();
  const visible = useMemo(() => {
    const rows = data?.items ?? [];
    if (term === "") return rows;
    return rows.filter((workspace) => {
      const managerText = workspace.manager
        ? `${personName(workspace.manager)} ${workspace.manager.email}`.toLowerCase()
        : "";
      return managerText.includes(term);
    });
  }, [data?.items, term]);

  const users = usersQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const filtersActive = term !== "";

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
        <p role="status">Loading workspaces…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${visible.length} of ${total} on this page match`
                : `${total} workspace${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New workspace
              </Button>
            ) : null}
          </div>

          <WorkspaceFilters
            kind={activeKind}
            kinds={kinds}
            search={search}
            onKindChange={(value) => {
              // A new kind is a real refetch; start at its first page.
              setKind(value);
              setPage(1);
            }}
            // Search filters the current page in the browser, so leave the
            // page where it is.
            onSearchChange={setSearch}
          />

          <WorkspacesTable
            workspaces={visible}
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
        <CreateWorkspaceDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          kind={activeKind}
          managers={users}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setPage(1);
            setAnnouncement("Workspace created.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <WorkspaceDetailDialog
        workspaceId={selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        users={users}
        teams={teams}
        canAssignManager={abilities.canAssignManager}
        canAssignMembers={abilities.canAssignMembers}
        canDelete={abilities.canDelete}
        getWorkspace={getWorkspace}
        onAssignManager={(id, managerId) =>
          mutations.assignManager.mutateAsync({ id, managerId })
        }
        onAssignTeam={(id, teamId) =>
          mutations.assignTeam.mutateAsync({ id, teamId })
        }
        onRemoveTeam={(id, teamId) =>
          mutations.removeTeam.mutateAsync({ id, teamId })
        }
        onAddParticipant={(id, userId) =>
          mutations.addParticipant.mutateAsync({ id, userId })
        }
        onRemoveParticipant={(id, userId) =>
          mutations.removeParticipant.mutateAsync({ id, userId })
        }
        onDelete={mutations.remove.mutateAsync}
        onChanged={() => void listQuery.refetch()}
        onDeleted={() => {
          setSelectedId(null);
          setAnnouncement("Workspace deleted.");
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
