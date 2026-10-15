/**
 * A progress bar with its figures in text beside it, so the value never
 * relies on the bar's color alone. With nothing counted yet (`percent ===
 * null`) it shows only the text, never a fabricated 0% bar.
 */
export function ProgressBar({
  percent,
  summary,
  label = "Progress",
}: {
  percent: number | null;
  summary: string;
  /** Accessible name. */
  label?: string;
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
          className="bg-primary h-full rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-muted-foreground block text-xs">{summary}</span>
    </div>
  );
}
