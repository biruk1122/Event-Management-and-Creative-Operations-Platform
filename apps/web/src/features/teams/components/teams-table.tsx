import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  activityOf,
  personName,
  TEAM_ACTIVITY_LABELS,
} from "../lib/teams-types";
import type { Team } from "../lib/teams-types";

interface TeamsTableProps {
  teams: readonly Team[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function StatusBadge({ team }: { team: Team }) {
  const activity = activityOf(team);
  return (
    <Badge variant={activity === "ACTIVE" ? "default" : "secondary"}>
      {TEAM_ACTIVITY_LABELS[activity]}
    </Badge>
  );
}

function managerLabel(team: Team): string {
  return team.manager ? personName(team.manager) : "Unassigned";
}

export function TeamsTable({
  teams,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: TeamsTableProps) {
  if (teams.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No teams match these filters" : "No teams yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New team button above to add the first one."}
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
                Department
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Members
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {teams.map((team) => (
              <tr key={team.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(team.id)}
                  >
                    {team.name}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {team.department.name}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(team)}
                </td>
                <td className="text-muted-foreground px-4 py-3 tabular-nums">
                  {team.members.length}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge team={team} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {teams.map((team) => (
          <li key={team.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(team.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {team.name}
                <StatusBadge team={team} />
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {team.department.name}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(team)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {team.members.length} member
                {team.members.length === 1 ? "" : "s"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Teams pagination"
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
