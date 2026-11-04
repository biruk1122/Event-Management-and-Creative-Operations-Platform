import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import { TalentCard } from "./talent-card";
import type { Talent } from "../lib/talent-types";

interface TalentCardGridProps {
  talents: readonly Talent[];
  total: number;
  pageSize: number;
  canAssign: boolean;
  onSelect: (id: string) => void;
  onAssign: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function countLabel(total: number): string {
  return `${total} ${total === 1 ? "talent" : "talents"}`;
}

/** Page numbers with gaps: the first and last page, and the neighbours of the current one. */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  const items: (number | "gap")[] = [];
  for (let n = 1; n <= pageCount; n++) {
    if (n === 1 || n === pageCount || Math.abs(n - page) <= 1) {
      items.push(n);
    } else if (items.at(-1) !== "gap") {
      items.push("gap");
    }
  }
  return items;
}

export function TalentCardGrid({
  talents,
  total,
  pageSize,
  canAssign,
  onSelect,
  onAssign,
  page,
  pageCount,
  onPageChange,
  filtered,
}: TalentCardGridProps) {
  if (talents.length === 0) {
    return (
      <div className="border-border bg-card rounded-2xl border border-dashed py-12 text-center">
        <p className="text-muted-foreground text-sm">
          <span>{countLabel(total)}</span>
        </p>
        <p className="mt-2 text-sm font-medium">
          {filtered
            ? "No talent match these filters"
            : "No talent profiles yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the Add Talent button above to create the first one."}
        </p>
      </div>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="space-y-6">
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {talents.map((talent) => (
          <li key={talent.id} className="h-full">
            <TalentCard
              talent={talent}
              canAssign={canAssign}
              onSelect={onSelect}
              onAssign={onAssign}
            />
          </li>
        ))}
      </ul>

      <nav
        aria-label="Talent pagination"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p className="text-muted-foreground text-sm">
          Showing {first}–{last} of <span>{countLabel(total)}</span>
        </p>
        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            {pageItems(page, pageCount).map((item, index) =>
              item === "gap" ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="text-muted-foreground px-2 text-sm"
                >
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  type="button"
                  variant={item === page ? "default" : "outline"}
                  size="icon"
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </Button>
              ),
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </nav>
    </div>
  );
}
