import {
  progressSummary,
  type CampaignProgress as Progress,
} from "../lib/campaigns-types";

interface CampaignProgressProps {
  progress: Progress;
  /** Accessible name; defaults to a generic label. */
  label?: string;
}

/**
 * A progress bar with its figures in text beside it, so the value never relies
 * on the bar's color alone. With nothing counted yet it shows only the text.
 */
export function CampaignProgress({
  progress,
  label = "Campaign progress",
}: CampaignProgressProps) {
  const summary = progressSummary(progress);

  if (progress.percent === null) {
    return <span className="text-muted-foreground text-sm">{summary}</span>;
  }

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={summary}
        className="bg-muted h-2 w-full min-w-24 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className="text-muted-foreground block text-xs">{summary}</span>
    </div>
  );
}
