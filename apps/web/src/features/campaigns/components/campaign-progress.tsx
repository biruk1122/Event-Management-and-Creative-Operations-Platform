import { ProgressBar } from "@/components/ui/progress-bar";
import {
  progressSummary,
  type CampaignProgress as Progress,
} from "../lib/campaigns-types";

interface CampaignProgressProps {
  progress: Progress;
  /** Accessible name; defaults to a generic label. */
  label?: string;
}

export function CampaignProgress({
  progress,
  label = "Campaign progress",
}: CampaignProgressProps) {
  return (
    <ProgressBar
      percent={progress.percent}
      summary={progressSummary(progress)}
      label={label}
    />
  );
}
