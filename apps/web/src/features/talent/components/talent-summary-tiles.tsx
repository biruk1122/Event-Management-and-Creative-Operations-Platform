import { Briefcase, CalendarClock, Users, UserCheck } from "lucide-react";

import type { TalentSummary } from "../lib/talent-types";

interface TalentSummaryTilesProps {
  summary: TalentSummary | undefined;
  pending: boolean;
}

const PLACEHOLDER = "–";

/** Four directory counts above the list. Shows dashes while loading. */
export function TalentSummaryTiles({
  summary,
  pending,
}: TalentSummaryTilesProps) {
  const tiles = [
    {
      label: "Talent profiles",
      value: summary?.total,
      icon: Users,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Available now",
      value: summary?.byAvailability.AVAILABLE ?? 0,
      icon: UserCheck,
      tint: "bg-secondary text-secondary-foreground",
    },
    {
      label: "Assigned talent",
      value: summary?.assignedTalents,
      icon: Briefcase,
      tint: "bg-accent text-accent-foreground",
    },
    {
      label: "Active assignments",
      value: summary?.activeAssignments,
      icon: CalendarClock,
      tint: "bg-muted text-foreground",
    },
  ];

  return (
    <dl aria-busy={pending} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        // A definition-list group holds its dt and dd directly; the icon sits
        // beside the card's text through its own grid cell, not a wrapper.
        <div
          key={tile.label}
          className="border-border bg-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-2xl border p-5 shadow-sm"
        >
          <span
            aria-hidden="true"
            className={`${tile.tint} row-span-2 inline-flex size-11 items-center justify-center rounded-xl`}
          >
            <tile.icon className="size-5" />
          </span>
          <dt className="text-muted-foreground truncate text-xs font-medium">
            {tile.label}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {tile.value ?? PLACEHOLDER}
          </dd>
        </div>
      ))}
    </dl>
  );
}
