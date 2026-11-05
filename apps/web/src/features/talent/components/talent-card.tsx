import { CalendarPlus, Briefcase, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

import { TalentAvailabilityBadge } from "./availability-badges";
import { TalentAvatar } from "./talent-avatar";
import {
  personName,
  talentTypeLabel,
  type Talent,
  type TalentCurrentAssignment,
} from "../lib/talent-types";

interface TalentCardProps {
  talent: Talent;
  onSelect: (id: string) => void;
}

function managerLabel(talent: Talent): string {
  return talent.manager ? personName(talent.manager) : "Unassigned";
}

function currentLabel(current: TalentCurrentAssignment): string {
  const phase = current.phase === "active" ? "Active" : "Upcoming";
  return `${current.workName} (${phase})`;
}

export function TalentCard({ talent, onSelect }: TalentCardProps) {
  const current = talent.currentAssignment;
  const assigned = talent.activeAssignmentCount;
  const assignedLabel =
    assigned === 1 ? "1 work item" : `${assigned} work items`;

  return (
    <article
      aria-labelledby={`talent-card-${talent.id}`}
      className="border-border bg-card flex h-full flex-col gap-5 rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex gap-4">
        <TalentAvatar
          fullName={talent.fullName}
          profileImageUrl={talent.profileImageUrl}
          size="tile"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <TalentAvailabilityBadge availability={talent.availability} />
          </div>
          <div className="min-w-0">
            <h3
              id={`talent-card-${talent.id}`}
              className="truncate text-lg font-semibold"
            >
              {talent.fullName}
            </h3>
            <p className="text-muted-foreground truncate text-sm">
              {talentTypeLabel(talent.type)}
            </p>
          </div>
          <p className="bg-muted text-muted-foreground w-fit max-w-full truncate rounded-full px-2.5 py-0.5 text-xs">
            Managed by {managerLabel(talent)}
          </p>
        </div>
      </div>

      <dl className="border-border grid grid-cols-2 gap-4 border-t pt-4 text-sm">
        <div className="min-w-0 space-y-1">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarPlus aria-hidden="true" className="size-3.5" />
            Current assignment
          </dt>
          <dd className="truncate font-medium">
            {current ? currentLabel(current) : "None"}
          </dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Briefcase aria-hidden="true" className="size-3.5" />
            Assigned to
          </dt>
          <dd className="font-medium">{assignedLabel}</dd>
        </div>
      </dl>

      <div className="mt-auto flex justify-center">
        <Button
          type="button"
          variant="outline"
          aria-label={`View profile of ${talent.fullName}`}
          onClick={() => onSelect(talent.id)}
        >
          <Eye aria-hidden="true" data-icon="inline-start" />
          View profile
        </Button>
      </div>
    </article>
  );
}
