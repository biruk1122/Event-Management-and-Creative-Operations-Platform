import { Button } from "@/components/ui/button";

import { TalentAvailabilityBadge } from "./availability-badges";
import { personName, talentTypeLabel, type Talent } from "../lib/talent-types";

interface TalentTableProps {
  talents: readonly Talent[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function managerLabel(talent: Talent): string {
  return talent.manager ? personName(talent.manager) : "Unassigned";
}

export function TalentTable({
  talents,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: TalentTableProps) {
  if (talents.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered
            ? "No talent match these filters"
            : "No talent profiles yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New talent button above to create the first one."}
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
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Availability
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {talents.map((talent) => (
              <tr key={talent.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(talent.id)}
                  >
                    {talent.fullName}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {talentTypeLabel(talent.type)}
                </td>
                <td className="px-4 py-3">
                  <TalentAvailabilityBadge availability={talent.availability} />
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(talent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {talents.map((talent) => (
          <li key={talent.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(talent.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {talent.fullName}
                <TalentAvailabilityBadge availability={talent.availability} />
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {talentTypeLabel(talent.type)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(talent)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Talent pagination"
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
