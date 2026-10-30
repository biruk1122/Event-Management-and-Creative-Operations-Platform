import { cn } from "@/lib/utils";

export type ProgressBarTone =
  "neutral" | "active" | "attention" | "success" | "danger";

const FILL_CLASS: Record<ProgressBarTone, string> = {
  neutral: "bg-muted-foreground/40",
  active: "bg-primary",
  attention: "bg-warning",
  success: "bg-success",
  danger: "bg-destructive",
};

/**
 * A progress bar with its figures in text beside it, so the value never
 * relies on the bar's color alone. With nothing counted yet (`percent ===
 * null`) it shows only the text, never a fabricated 0% bar. `tone`
 * defaults to the original solid-primary look, so existing consumers are
 * unaffected unless they opt into a status-driven color.
 */
export function ProgressBar({
  percent,
  summary,
  label = "Progress",
  tone = "active",
}: {
  percent: number | null;
  summary: string;
  /** Accessible name. */
  label?: string;
  tone?: ProgressBarTone;
}) {
  if (percent === null) {
    return <span className="text-muted-foreground text-sm">{summary}</span>;
  }

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={summary}
        className="bg-muted h-2 w-full min-w-24 overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full rounded-full", FILL_CLASS[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-muted-foreground block text-xs">{summary}</span>
    </div>
  );
}
