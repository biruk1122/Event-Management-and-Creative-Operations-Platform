import { Badge } from "@/components/ui/badge";

import {
  activityStatusLabel,
  campaignStatusLabel,
  type CampaignActivityStatus,
  type CampaignStatus,
} from "../lib/campaigns-types";

/**
 * Status badges for campaigns and their activities. Cancelled is drawn as an
 * outlined badge with destructive-colored text on the plain background rather
 * than the shared `destructive` variant: that variant's text on its 10% tinted
 * background is about 4.45:1, below the 4.5:1 WCAG AA minimum for this text
 * size. The plain-background pairing is about 4.8:1. The label always names the
 * status, so color is never the only cue. The shared token pair is owned by the
 * accessibility audit (REL-05).
 */
const CANCELLED_CLASS = "text-destructive";

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  switch (status) {
    case "PLANNED":
      return <Badge variant="secondary">{campaignStatusLabel(status)}</Badge>;
    case "ACTIVE":
      return <Badge>{campaignStatusLabel(status)}</Badge>;
    case "COMPLETED":
      return <Badge variant="outline">{campaignStatusLabel(status)}</Badge>;
    case "CANCELLED":
      return (
        <Badge variant="outline" className={CANCELLED_CLASS}>
          {campaignStatusLabel(status)}
        </Badge>
      );
  }
}

export function ActivityStatusBadge({
  status,
}: {
  status: CampaignActivityStatus;
}) {
  switch (status) {
    case "PLANNED":
      return <Badge variant="secondary">{activityStatusLabel(status)}</Badge>;
    case "IN_PROGRESS":
      return <Badge>{activityStatusLabel(status)}</Badge>;
    case "COMPLETED":
      return <Badge variant="outline">{activityStatusLabel(status)}</Badge>;
    case "CANCELLED":
      return (
        <Badge variant="outline" className={CANCELLED_CLASS}>
          {activityStatusLabel(status)}
        </Badge>
      );
  }
}
