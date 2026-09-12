import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  personName,
  projectStatusLabel,
  scheduleSummary,
  type Project,
  type ProjectStatus,
} from "../lib/projects-types";

interface ProjectsTableProps {
  projects: readonly Project[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

const STATUS_VARIANT: Record<
  ProjectStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PLANNED: "secondary",
  ACTIVE: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

function managerLabel(project: Project): string {
  return project.manager ? personName(project.manager) : "Unassigned";
}

export function ProjectsTable({
  projects,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: ProjectsTableProps) {
  if (projects.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No projects match these filters" : "No projects yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New project button above to create the first one."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Schedule
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {projects.map((project) => (
              <tr key={project.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(project.id)}
                  >
                    {project.name}
                  </button>
                </th>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[project.status]}>
                    {projectStatusLabel(project.status)}
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {scheduleSummary(project)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(project)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {projects.map((project) => (
          <li key={project.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(project.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {project.name}
                <Badge variant={STATUS_VARIANT[project.status]}>
                  {projectStatusLabel(project.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {scheduleSummary(project)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(project)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Projects pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
