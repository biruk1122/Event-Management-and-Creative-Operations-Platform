"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { addTeamMember as defaultAddMember } from "../api/add-team-member";
import { assignTeamManager as defaultAssignManager } from "../api/assign-team-manager";
import { createTeam as defaultCreateTeam } from "../api/create-team";
import { deactivateTeam as defaultDeactivateTeam } from "../api/deactivate-team";
import { deleteTeam as defaultDeleteTeam } from "../api/delete-team";
import { getTeam as defaultGetTeam } from "../api/get-team";
import { reactivateTeam as defaultReactivateTeam } from "../api/reactivate-team";
import { removeTeamMember as defaultRemoveMember } from "../api/remove-team-member";
import { updateTeam as defaultUpdateTeam } from "../api/update-team";
import { CreateTeamDialog } from "./create-team-dialog";
import { TeamDetailDialog } from "./team-detail-dialog";
import { TeamFilters } from "./team-filters";
import { TeamsTable } from "./teams-table";
import type {
  AddTeamMember,
  AssignManager,
  CreateTeam,
  DeactivateTeam,
  DeleteTeam,
  GetTeam,
  ReactivateTeam,
  RemoveTeamMember,
  UpdateTeam,
} from "../lib/teams-outcome";
import {
  activityOf,
  personName,
  type AssignableDepartment,
  type AssignableUser,
  type PaginatedTeams,
  type Team,
  type TeamActivity,
} from "../lib/teams-types";

const PAGE_SIZE = 10;

interface TeamsManagerProps {
  initialPage: PaginatedTeams;
  departments: readonly AssignableDepartment[];
  managers: readonly AssignableUser[];
  createTeam?: CreateTeam;
  updateTeam?: UpdateTeam;
  assignManager?: AssignManager;
  addMember?: AddTeamMember;
  removeMember?: RemoveTeamMember;
  deactivateTeam?: DeactivateTeam;
  reactivateTeam?: ReactivateTeam;
  deleteTeam?: DeleteTeam;
  getTeam?: GetTeam;
}

export function TeamsManager({
  initialPage,
  departments,
  managers,
  createTeam = defaultCreateTeam,
  updateTeam = defaultUpdateTeam,
  assignManager = defaultAssignManager,
  addMember = defaultAddMember,
  removeMember = defaultRemoveMember,
  deactivateTeam = defaultDeactivateTeam,
  reactivateTeam = defaultReactivateTeam,
  deleteTeam = defaultDeleteTeam,
  getTeam = defaultGetTeam,
}: TeamsManagerProps) {
  const [teams, setTeams] = useState<Team[]>([...initialPage.items]);
  const [statusFilter, setStatusFilter] = useState<TeamActivity | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((team) => {
      if (statusFilter && activityOf(team) !== statusFilter) {
        return false;
      }
      if (departmentFilter && team.department.id !== departmentFilter) {
        return false;
      }
      if (term === "") {
        return true;
      }
      const managerText = team.manager
        ? personName(team.manager).toLowerCase()
        : "";
      return (
        team.name.toLowerCase().includes(term) || managerText.includes(term)
      );
    });
  }, [teams, statusFilter, departmentFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function upsertTeam(next: Team) {
    setTeams((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) {
        return [next, ...current];
      }
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  function removeTeam(id: string) {
    setTeams((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
  }

  const filtersActive =
    statusFilter !== null || departmentFilter !== null || search.trim() !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {teams.length} team{teams.length === 1 ? "" : "s"}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New team
        </Button>
      </div>

      <TeamFilters
        status={statusFilter}
        departmentId={departmentFilter}
        search={search}
        departments={departments}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onDepartmentChange={(value) => {
          setDepartmentFilter(value);
          setPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      <TeamsTable
        teams={visible}
        onSelect={setSelectedId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={filtersActive}
      />

      <CreateTeamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        departments={departments}
        managers={managers}
        onCreate={createTeam}
        onCreated={(team) => {
          upsertTeam(team);
          setPage(1);
          setSearch("");
          setStatusFilter(null);
          setDepartmentFilter(null);
        }}
      />

      <TeamDetailDialog
        teamId={selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        managers={managers}
        getTeam={getTeam}
        onUpdate={updateTeam}
        onAssignManager={assignManager}
        onAddMember={addMember}
        onRemoveMember={removeMember}
        onDeactivate={deactivateTeam}
        onReactivate={reactivateTeam}
        onDelete={deleteTeam}
        onChanged={upsertTeam}
        onDeleted={removeTeam}
      />
    </div>
  );
}
