import { personName } from "../lib/talent-types";
import type { TalentActivity } from "../api/talent-assignments-gateway";

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: "Profile created",
  UPDATED: "Profile details updated",
  AVAILABILITY_CHANGED: "Availability changed",
  MANAGER_CHANGED: "Manager changed",
  PROFILE_IMAGE_CHANGED: "Profile photo changed",
  ASSIGNED: "Assigned to work",
  ASSIGNMENT_UPDATED: "Assignment updated",
  ASSIGNMENT_COMPLETED: "Assignment completed",
  ASSIGNMENT_CANCELLED: "Assignment cancelled",
  CONFLICT_OVERRIDDEN: "Scheduling conflict overridden",
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}

const WHEN = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface TalentHistoryTimelineProps {
  items: readonly TalentActivity[];
}

/** The talent's change history, newest first. Entries are never edited, only added to. */
export function TalentHistoryTimeline({ items }: TalentHistoryTimelineProps) {
  if (items.length === 0) {
    return <p className="text-primary/70 text-sm">No changes recorded yet.</p>;
  }

  return (
    <ol className="border-primary/15 space-y-4 border-l pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden="true"
            className="bg-primary absolute top-1.5 -left-[21px] size-2.5 rounded-full"
          />
          <p className="text-sm font-medium">{activityLabel(item.type)}</p>
          <p className="text-primary/70 text-xs">
            <time dateTime={item.occurredAt}>
              {WHEN.format(new Date(item.occurredAt))}
            </time>
            {item.actor ? ` · ${personName(item.actor)}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
