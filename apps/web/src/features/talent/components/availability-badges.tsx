import { Badge } from "@/components/ui/badge";

import {
  assignmentStatusLabel,
  availabilityLabel,
  type TalentAssignmentStatus,
  type TalentAvailability,
} from "../lib/talent-types";

/**
 * Status badges for a talent's availability and their event assignments.
 * `INACTIVE` and `CANCELLED` are drawn as outlined badges with
 * destructive-colored text on the plain background rather than the shared
 * `destructive` variant: that variant's text on its 10% tinted background is
 * about 4.45:1, below the 4.5:1 WCAG AA minimum for this text size. The plain-
 * background pairing is about 4.8:1. The label always names the status, so
 * color is never the only cue. The shared token pair is owned by the
 * accessibility audit (REL-05).
 */
const MUTED_CLASS = "text-destructive";

export function TalentAvailabilityBadge({
  availability,
}: {
  availability: TalentAvailability;
}) {
  switch (availability) {
    case "AVAILABLE":
      return <Badge>{availabilityLabel(availability)}</Badge>;
    case "ASSIGNED":
      return (
        <Badge variant="secondary">{availabilityLabel(availability)}</Badge>
      );
    case "UNAVAILABLE":
      return <Badge variant="outline">{availabilityLabel(availability)}</Badge>;
    case "INACTIVE":
      return (
        <Badge variant="outline" className={MUTED_CLASS}>
          {availabilityLabel(availability)}
        </Badge>
      );
  }
}

export function AssignmentStatusBadge({
  status,
}: {
  status: TalentAssignmentStatus;
}) {
  switch (status) {
    case "ASSIGNED":
      return <Badge>{assignmentStatusLabel(status)}</Badge>;
    case "COMPLETED":
      return <Badge variant="outline">{assignmentStatusLabel(status)}</Badge>;
    case "CANCELLED":
      return (
        <Badge variant="outline" className={MUTED_CLASS}>
          {assignmentStatusLabel(status)}
        </Badge>
      );
  }
}
