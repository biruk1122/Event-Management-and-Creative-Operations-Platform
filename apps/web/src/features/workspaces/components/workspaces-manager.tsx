"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { addWorkspaceParticipant as defaultAddParticipant } from "../api/add-workspace-participant";
import { assignWorkspaceManager as defaultAssignManager } from "../api/assign-workspace-manager";
import { assignWorkspaceTeam as defaultAssignTeam } from "../api/assign-workspace-team";
import { createWorkspace as defaultCreateWorkspace } from "../api/create-workspace";
import { deleteWorkspace as defaultDeleteWorkspace } from "../api/delete-workspace";
import { getWorkspace as defaultGetWorkspace } from "../api/get-workspace";
import { removeWorkspaceParticipant as defaultRemoveParticipant } from "../api/remove-workspace-participant";
import { removeWorkspaceTeam as defaultRemoveTeam } from "../api/remove-workspace-team";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { WorkspaceDetailDialog } from "./workspace-detail-dialog";
import { WorkspaceFilters } from "./workspace-filters";
import { WorkspacesTable } from "./workspaces-table";
import type {
  AddWorkspaceParticipant,
  AssignWorkspaceManager,
  AssignWorkspaceTeam,
  CreateWorkspace,
  DeleteWorkspace,
  GetWorkspace,
  RemoveWorkspaceParticipant,
  RemoveWorkspaceTeam,
} from "../lib/workspaces-outcome";
import {
  personName,
  type AssignableTeam,
  type AssignableUser,
  type PaginatedWorkspaces,
  type Workspace,
  type WorkspaceKind,
} from "../lib/workspaces-types";

const PAGE_SIZE = 10;

interface WorkspacesManagerProps {
  initialPage: PaginatedWorkspaces;
  assignableUsers: readonly AssignableUser[];
  assignableTeams: readonly AssignableTeam[];
  createWorkspace?: CreateWorkspace;
  assignManager?: AssignWorkspaceManager;
  assignTeam?: AssignWorkspaceTeam;
  removeTeam?: RemoveWorkspaceTeam;
  addParticipant?: AddWorkspaceParticipant;
  removeParticipant?: RemoveWorkspaceParticipant;
  deleteWorkspace?: DeleteWorkspace;
  getWorkspace?: GetWorkspace;
}

export function WorkspacesManager({
  initialPage,
  assignableUsers,
  assignableTeams,
  createWorkspace = defaultCreateWorkspace,
  assignManager = defaultAssignManager,
  assignTeam = defaultAssignTeam,
  removeTeam = defaultRemoveTeam,
  addParticipant = defaultAddParticipant,
  removeParticipant = defaultRemoveParticipant,
  deleteWorkspace = defaultDeleteWorkspace,
  getWorkspace = defaultGetWorkspace,
}: WorkspacesManagerProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    ...initialPage.items,
  ]);
  const [kindFilter, setKindFilter] = useState<WorkspaceKind | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workspaces.filter((workspace) => {
      if (kindFilter && workspace.kind !== kindFilter) {
        return false;
      }
      if (term === "") {
        return true;
      }
      const managerText = workspace.manager
        ? `${personName(workspace.manager)} ${workspace.manager.email}`.toLowerCase()
        : "";
      return managerText.includes(term);
    });
  }, [workspaces, kindFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filtersActive = kindFilter !== null || search.trim() !== "";

  function upsertWorkspace(next: Workspace) {
    setWorkspaces((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) {
        return [next, ...current];
      }
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  function removeWorkspace(id: string) {
    setWorkspaces((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
    setAnnouncement("Workspace deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {filtered.length} workspace{filtered.length === 1 ? "" : "s"}
          {filtersActive ? " match these filters" : ""}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New workspace
        </Button>
      </div>

      <WorkspaceFilters
        kind={kindFilter}
        search={search}
        onKindChange={(value) => {
          setKindFilter(value);
          setPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      <WorkspacesTable
        workspaces={visible}
        onSelect={setSelectedId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={filtersActive}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        managers={assignableUsers}
        onCreate={createWorkspace}
        onCreated={(workspace) => {
          upsertWorkspace(workspace);
          setKindFilter(null);
          setSearch("");
          setPage(1);
          setAnnouncement("Workspace created.");
        }}
      />

      <WorkspaceDetailDialog
        workspaceId={selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        users={assignableUsers}
        teams={assignableTeams}
        getWorkspace={getWorkspace}
        onAssignManager={assignManager}
        onAssignTeam={assignTeam}
        onRemoveTeam={removeTeam}
        onAddParticipant={addParticipant}
        onRemoveParticipant={removeParticipant}
        onDelete={deleteWorkspace}
        onChanged={upsertWorkspace}
        onDeleted={removeWorkspace}
      />
    </div>
  );
}
