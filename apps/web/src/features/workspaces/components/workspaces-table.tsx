import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { personName, WORKSPACE_KIND_LABELS } from "../lib/workspaces-types";
import type { Workspace } from "../lib/workspaces-types";

interface WorkspacesTableProps {
  workspaces: readonly Workspace[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function managerLabel(workspace: Workspace): string {
  return workspace.manager ? personName(workspace.manager) : "Unassigned";
}

function workspaceLabel(workspace: Workspace): string {
  return `${WORKSPACE_KIND_LABELS[workspace.kind]} workspace`;
}

/**
 * Workspaces have no name of their own, so the row trigger folds in the
 * manager to give screen-reader and keyboard users a way to tell two
 * workspaces of the same kind apart.
 */
function workspaceTriggerLabel(workspace: Workspace): string {
  return workspace.manager
    ? `${workspaceLabel(workspace)} managed by ${personName(workspace.manager)}`
    : `${workspaceLabel(workspace)}, no manager`;
}

export function WorkspacesTable({
  workspaces,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: WorkspacesTableProps) {
  if (workspaces.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No workspaces match these filters" : "No workspaces yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New workspace button above to add the first one."}
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
                Kind
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Teams
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Participants
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {workspaces.map((workspace) => (
              <tr key={workspace.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    aria-label={workspaceTriggerLabel(workspace)}
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(workspace.id)}
                  >
                    {workspaceLabel(workspace)}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(workspace)}
                </td>
                <td className="text-muted-foreground px-4 py-3 tabular-nums">
                  {workspace.teams.length}
                </td>
                <td className="text-muted-foreground px-4 py-3 tabular-nums">
                  {workspace.participants.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {workspaces.map((workspace) => (
          <li
            key={workspace.id}
            className="border-border rounded-xl border p-4"
          >
            <button
              type="button"
              aria-label={workspaceTriggerLabel(workspace)}
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(workspace.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {workspaceLabel(workspace)}
                <Badge variant="secondary">
                  {WORKSPACE_KIND_LABELS[workspace.kind]}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(workspace)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {workspace.teams.length} team
                {workspace.teams.length === 1 ? "" : "s"} ·{" "}
                {workspace.participants.length} participant
                {workspace.participants.length === 1 ? "" : "s"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Workspaces pagination"
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
