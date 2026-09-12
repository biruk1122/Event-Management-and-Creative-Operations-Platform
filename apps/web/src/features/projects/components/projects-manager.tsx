"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { assignProjectManager as defaultAssignManager } from "../api/assign-project-manager";
import { assignProjectTeam as defaultAssignTeam } from "../api/assign-project-team";
import { createProject as defaultCreateProject } from "../api/create-project";
import { deleteProject as defaultDeleteProject } from "../api/delete-project";
import { getProject as defaultGetProject } from "../api/get-project";
import { removeProjectTeam as defaultRemoveTeam } from "../api/remove-project-team";
import { transitionProject as defaultTransition } from "../api/transition-project";
import { updateProject as defaultUpdateProject } from "../api/update-project";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectDetailDialog } from "./project-detail-dialog";
import { ProjectFilters } from "./project-filters";
import { ProjectsTable } from "./projects-table";
import type {
  AssignProjectManager,
  AssignProjectTeam,
  CreateProject,
  DeleteProject,
  GetProject,
  RemoveProjectTeam,
  TransitionProject,
  UpdateProject,
} from "../lib/projects-outcome";
import {
  type AssignableEvent,
  type AssignableTeam,
  type AssignableUser,
  type PaginatedProjects,
  type Project,
  type ProjectStatus,
} from "../lib/projects-types";

const PAGE_SIZE = 10;

interface ProjectsManagerProps {
  initialPage: PaginatedProjects;
  assignableUsers: readonly AssignableUser[];
  assignableTeams: readonly AssignableTeam[];
  assignableEvents: readonly AssignableEvent[];
  createProject?: CreateProject;
  updateProject?: UpdateProject;
  transitionProject?: TransitionProject;
  assignManager?: AssignProjectManager;
  assignTeam?: AssignProjectTeam;
  removeTeam?: RemoveProjectTeam;
  deleteProject?: DeleteProject;
  getProject?: GetProject;
}

export function ProjectsManager({
  initialPage,
  assignableUsers,
  assignableTeams,
  assignableEvents,
  createProject = defaultCreateProject,
  updateProject = defaultUpdateProject,
  transitionProject = defaultTransition,
  assignManager = defaultAssignManager,
  assignTeam = defaultAssignTeam,
  removeTeam = defaultRemoveTeam,
  deleteProject = defaultDeleteProject,
  getProject = defaultGetProject,
}: ProjectsManagerProps) {
  const [projects, setProjects] = useState<Project[]>([...initialPage.items]);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (statusFilter && project.status !== statusFilter) return false;
      if (term === "") return true;
      return project.name.toLowerCase().includes(term);
    });
  }, [projects, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filtersActive = statusFilter !== null || search.trim() !== "";

  function upsert(next: Project) {
    setProjects((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  function remove(id: string) {
    setProjects((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
    setAnnouncement("Project deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
          {filtersActive ? " match these filters" : ""}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New project
        </Button>
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
        projects={visible}
        onSelect={setSelectedId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={filtersActive}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        managers={assignableUsers}
        events={assignableEvents}
        onCreate={createProject}
        onCreated={(project) => {
          upsert(project);
          setStatusFilter(null);
          setSearch("");
          setPage(1);
          setAnnouncement("Project created.");
        }}
      />

      <ProjectDetailDialog
        projectId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={assignableUsers}
        teams={assignableTeams}
        events={assignableEvents}
        getProject={getProject}
        onUpdate={updateProject}
        onTransition={transitionProject}
        onAssignManager={assignManager}
        onAssignTeam={assignTeam}
        onRemoveTeam={removeTeam}
        onDelete={deleteProject}
        onChanged={upsert}
        onDeleted={remove}
      />
    </div>
  );
}
