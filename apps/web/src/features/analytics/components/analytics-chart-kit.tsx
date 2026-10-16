"use client";

import {
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { components } from "@event-platform/api-client";
import { rateLabel, type Responses } from "../lib/analytics-presentation";

type Schemas = components["schemas"];

export interface CategoryBarDatum {
  label: string;
  value: number | null;
  detail: string;
}

/** Shared row transform for the "page" progress measures (departments,
 * events, campaigns) - one place for the "Subject: {id}" label convention
 * already established by the hand-rolled `Bars` component on /analytics, so
 * the dashboard's remaining analytics cards and the Analytics page's pinned
 * department-performance section never diverge on how a row reads. */
export function progressRows(
  items: readonly (Schemas["EntityWorkCounts"] | Schemas["EntityProgress"])[],
): CategoryBarDatum[] {
  return items.map((row) => ({
    label: `Subject: ${row.id}`,
    value: row.percent,
    detail:
      row.percent === null
        ? `No eligible work (${row.completed} / ${row.total})`
        : `${row.percent}% (${row.completed} / ${row.total} completed / eligible)`,
  }));
}

/** Same shape, for the promotion-channel measure. */
export function promotionRows(
  items: readonly Schemas["PromotionChannelProgress"][],
): CategoryBarDatum[] {
  return items.map((row) => ({
    label: `Channel: ${row.channel.toLowerCase().replaceAll("_", " ")}`,
    value: row.percent,
    detail:
      row.percent === null
        ? `No eligible work (${row.completed} / ${row.total})`
        : `${row.percent}% (${row.completed} / ${row.total} completed / eligible)`,
  }));
}

type MonthlyRow =
  components["schemas"]["MonthlyAnalyticsResponse"]["items"][number];

/** Shared month-by-month series definitions for the monthly-activity
 * measure - used by both the dashboard's line charts and /analytics' own
 * hand-rolled SVG graphs, so the list of series/labels lives in one place. */
export const monthlySeries = [
  ["tasksCreated", "Tasks created"],
  ["eventsCreated", "Events created"],
  ["projectsCreated", "Projects created"],
  ["productionsCreated", "Productions created"],
  ["campaignsCreated", "Campaigns created"],
  ["tasksCompleted", "Tasks completed"],
] as const satisfies readonly (readonly [
  Exclude<keyof MonthlyRow, "month">,
  string,
])[];

/** `--chart-{1..5}` CSS custom property, as a literal string the browser
 * resolves at paint time - never a JS-resolved color, so every chart stays
 * correct across the light/dark theme toggle with no re-render. */
export function chartColor(index: number): string {
  return `var(--chart-${(index % 5) + 1})`;
}

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function reducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
/** Recharts' animation is JS-driven (react-smooth), so the app's global
 * `@media (prefers-reduced-motion: reduce)` CSS rule never reaches it - every
 * chart below must read this hook and forward it into `isAnimationActive`/
 * `animationDuration`. */
export function useChartAnimationDuration(): number {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );
  return reduced ? 0 : 300;
}

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  borderColor: "var(--border)",
  borderRadius: "0.5rem",
  color: "var(--popover-foreground)",
  fontSize: "0.8125rem",
};
const tooltipLabelStyle: CSSProperties = { color: "var(--popover-foreground)" };
const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

function ChartFigure({
  caption,
  note,
  srDescription,
  children,
}: {
  caption: string;
  note?: string;
  srDescription: string;
  children: ReactNode;
}) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-semibold">{caption}</figcaption>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      {children}
      <p className="sr-only">{srDescription}</p>
    </figure>
  );
}

/** Donut completion gauge - replaces the `<meter>` on the analytics task
 * completion panel; the existing `<dl>` stat grid beside it stays the
 * numeric equivalent. Returns `null` when there is no eligible work,
 * matching the meter's own guard (no fabricated 0% ring). Sized for its one
 * remaining consumer, the full-width Analytics panel (no Dashboard card uses
 * this any more). */
export function CompletionDonut({
  completed,
  total,
  percent,
}: {
  completed: number;
  total: number;
  percent: number | null;
}) {
  const duration = useChartAnimationDuration();
  if (percent === null) return null;
  const remaining = Math.max(total - completed, 0);
  const data = [
    { name: "Completed", value: completed },
    { name: "Remaining", value: remaining },
  ];
  return (
    <ChartFigure
      caption="Completion"
      srDescription={`Completed: ${completed}. Remaining: ${remaining}.`}
    >
      <div
        role="img"
        aria-label={`Completion: ${rateLabel(percent)} (${completed} of ${total})`}
        className="relative mx-auto"
        style={{ width: 220, height: 220 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={74}
              outerRadius={104}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={duration > 0}
              animationDuration={duration}
            >
              <Cell fill="var(--chart-1)" />
              <Cell fill="var(--muted)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums">
          {rateLabel(percent)}
        </p>
      </div>
      <p className="text-muted-foreground text-center text-sm">
        {completed} of {total}
      </p>
    </ChartFigure>
  );
}

function BarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CategoryBarDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      style={tooltipContentStyle}
      className="rounded-lg border px-3 py-2 shadow-sm"
    >
      <p className="font-medium">{row.label}</p>
      <p className="text-muted-foreground text-xs">{row.detail}</p>
    </div>
  );
}

const categoryBarSizes = {
  compact: { rowHeight: 34, minHeight: 90, yAxisWidth: 132, tickFontSize: 11 },
  spacious: {
    rowHeight: 44,
    minHeight: 160,
    yAxisWidth: 220,
    tickFontSize: 12,
  },
} as const;

/** Horizontal bar chart, one bar per category - a visual upgrade of the
 * existing hand-rolled `Bars` component on /analytics (same reading
 * direction, same "numeric detail per bar" discipline). Used both on the
 * dashboard's remaining progress-style Analytics cards (`size="compact"`,
 * the default) and the Analytics page's full-width department-performance
 * panel (`size="spacious"`, which also gives the "Subject: {id}" labels
 * enough room that a UUID isn't immediately clipped). Returns `null` when
 * nothing has an eligible value, matching `AnalyticsCharts`' own
 * empty-state discipline. */
export function CategoryBarChart({
  title,
  data,
  maxValue,
  size = "compact",
}: {
  title: string;
  data: readonly CategoryBarDatum[];
  maxValue: number;
  size?: "compact" | "spacious";
}) {
  const duration = useChartAnimationDuration();
  const rows = data.filter(
    (row): row is CategoryBarDatum & { value: number } => row.value !== null,
  );
  if (rows.length === 0) return null;
  const { rowHeight, minHeight, yAxisWidth, tickFontSize } =
    categoryBarSizes[size];
  const height = Math.max(rows.length * rowHeight + 24, minHeight);
  const tick = { fill: "var(--muted-foreground)", fontSize: tickFontSize };
  return (
    <ChartFigure
      caption={title}
      srDescription={rows
        .map((row) => `${row.label}: ${row.detail}`)
        .join("; ")}
    >
      <div role="img" aria-label={title} style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 20, bottom: 4, left: 4 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, maxValue]}
              tick={tick}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={yAxisWidth}
              tick={tick}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={<BarTooltip />}
            />
            <Bar
              dataKey="value"
              isAnimationActive={duration > 0}
              animationDuration={duration}
              radius={[0, 4, 4, 0]}
            >
              {rows.map((row, index) => (
                <Cell key={row.label} fill={chartColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}

/** One line-chart "small multiple" per monthly series - a visual upgrade of
 * the existing hand-rolled SVG `MonthlyGraphs`. A single observation renders
 * as a lone point with no connecting segment, which Recharts handles
 * natively. Sized for its one remaining consumer, the full-width Analytics
 * monthly-activity panel (no Dashboard card uses this any more). */
export function MonthlyLineChart({
  data,
  seriesKey,
  seriesLabel,
  colorIndex,
}: {
  data: Responses["monthly"];
  seriesKey: Exclude<keyof MonthlyRow, "month">;
  seriesLabel: string;
  colorIndex: number;
}) {
  const duration = useChartAnimationDuration();
  const color = chartColor(colorIndex);
  const rows = data.items;
  return (
    <ChartFigure
      caption={`${seriesLabel} by month`}
      note="Counts · UTC months · exact values in the table below"
      srDescription={rows
        .map((row) => `${row.month}: ${row[seriesKey]}`)
        .join("; ")}
    >
      <div
        role="img"
        aria-label={`${seriesLabel}: count by UTC month`}
        style={{ width: "100%", height: 240 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 12, right: 20, bottom: 4, left: 4 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={axisTick}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={40}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
            />
            <Line
              type="monotone"
              dataKey={seriesKey}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: color }}
              activeDot={{ r: 5 }}
              isAnimationActive={duration > 0}
              animationDuration={duration}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
