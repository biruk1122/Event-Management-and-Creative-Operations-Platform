import { EVENT_TYPES, type EventSummary } from "../lib/events-types";

interface EventSummaryTilesProps {
  summary: EventSummary | undefined;
  loading: boolean;
}

function count(value: number | undefined): string {
  return value === undefined ? "—" : value.toString().padStart(2, "0");
}

/** The four headline tiles above the events listing. */
export function EventSummaryTiles({
  summary,
  loading,
}: EventSummaryTilesProps) {
  const tiles = [
    {
      label: "All events",
      value: summary?.total,
      note: `Across ${EVENT_TYPES.length} event types`,
    },
    {
      label: "Upcoming",
      value: summary?.upcoming,
      note: "Over the next 30 days",
    },
    {
      label: "In progress",
      value: summary?.inProgress,
      note: "Teams are at work",
    },
    {
      label: "Completed",
      value: summary?.completed,
      note: "This year",
    },
  ];

  return (
    <dl
      aria-busy={loading || undefined}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="bg-card border-border rounded-2xl border p-5 shadow-sm"
        >
          <dt className="text-muted-foreground text-sm">{tile.label}</dt>
          <dd className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
            {count(tile.value)}
          </dd>
          <dd className="text-muted-foreground mt-2 text-sm">{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}
