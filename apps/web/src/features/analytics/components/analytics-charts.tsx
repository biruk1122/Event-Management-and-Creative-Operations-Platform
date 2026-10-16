import type { CSSProperties } from "react";
import {
  MEASURES,
  type Measure,
  type Responses,
} from "../lib/analytics-presentation";
import { monthlySeries } from "./analytics-chart-kit";
import styles from "./analytics-charts.module.css";

function MonthlyGraphs({ data }: { data: Responses["monthly"] }) {
  return (
    <div className={styles.monthly}>
      {monthlySeries.map(([key, label], index) => {
        const ceiling = Math.max(1, ...data.items.map((row) => row[key]));
        const points = data.items.map((row, i) => ({
          x:
            data.items.length === 1
              ? 218
              : 48 + (i / (data.items.length - 1)) * 340,
          y: 160 - (row[key] / ceiling) * 120,
          row,
        }));
        return (
          <figure
            key={key}
            aria-label={`${label} monthly graph`}
            className={styles.figure}
          >
            <figcaption className="font-semibold">{label} by month</figcaption>
            <p className="text-muted-foreground mt-1 text-sm">
              Counts · UTC months · exact values in the table below
            </p>
            <svg
              viewBox="0 0 420 220"
              role="img"
              aria-label={`${label}: count by UTC month`}
              className={styles.line}
              style={
                {
                  "--series-color": `var(--chart-${(index % 5) + 1})`,
                } as CSSProperties
              }
            >
              <desc>
                {data.items
                  .map((row) => `${row.month}: ${row[key]}`)
                  .join("; ")}
                .{" "}
                {data.items.length === 1
                  ? "One observation; no trend line."
                  : "Lines connect returned monthly observations, not forecasts."}
              </desc>
              <path d="M48 40V160H388" className={styles.axis} />
              <path d="M48 40H388" className={styles.grid} />
              <text x="40" y="45" textAnchor="end">
                {new Intl.NumberFormat("en", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(ceiling)}
              </text>
              <text x="40" y="165" textAnchor="end">
                0
              </text>
              <text x="48" y="24">
                Count
              </text>
              {points.length > 1 ? (
                <polyline
                  points={points
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  className={styles.series}
                />
              ) : null}
              {points.map(({ x, y, row }) => (
                <circle
                  key={row.month}
                  cx={x}
                  cy={y}
                  r="4"
                  className={styles.point}
                />
              ))}
              <text
                x={points[0]!.x}
                y="185"
                textAnchor={points.length === 1 ? "middle" : "start"}
              >
                {points[0]!.row.month}
              </text>
              {points.length > 1 ? (
                <text x="388" y="185" textAnchor="end">
                  {points.at(-1)!.row.month}
                </text>
              ) : null}
              <text x="218" y="210" textAnchor="middle">
                Month (UTC)
              </text>
            </svg>
            <p className="text-muted-foreground text-xs">
              Solid line and dots: {label.toLowerCase()}. Compact axis ticks;
              full values are in the table. Observations, not forecasts.
            </p>
          </figure>
        );
      })}
    </div>
  );
}

type Bar = { label: string; value: number | null; detail: string };
function Bars({
  title,
  rows,
  maximum,
  unit,
  note,
}: {
  title: string;
  rows: Bar[];
  maximum: number;
  unit: string;
  note: string;
}) {
  return (
    <figure aria-label={title} className={styles.figure}>
      <figcaption className="font-semibold">{title}</figcaption>
      <p className="text-muted-foreground mt-1 text-sm">{note}</p>
      <p className="text-muted-foreground my-3 text-sm">
        Horizontal axis: {unit} · 0–{maximum}
      </p>
      <ul className="space-y-4">
        {rows.map((row, index) => (
          <li key={row.label} className="min-w-0 space-y-2">
            <p className="text-sm break-words">
              <span className="font-medium">{row.label}</span> — {row.detail}
            </p>
            {row.value !== null ? (
              <div className={styles.track} aria-hidden="true">
                {row.value > 0 ? (
                  <div
                    className={styles.bar}
                    style={
                      {
                        width: `${(row.value / maximum) * 100}%`,
                        "--series-color": `var(--chart-${(index % 5) + 1})`,
                      } as CSSProperties
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 text-xs">
        Categories are labelled above each bar; exact values remain readable
        without hover.
      </p>
    </figure>
  );
}

/** Read-only rendering of the selected, already authorized response. */
export function AnalyticsCharts({
  measure,
  data,
}: {
  measure: Measure;
  data: Responses[Measure];
}) {
  if ("counts" in data) {
    if (data.counts.total === 0) return null;
    const { completed, pending, overdue } = data.counts;
    return (
      <Bars
        title="Task status comparison"
        unit="task count"
        maximum={Math.max(1, completed, pending, overdue)}
        note="Overdue tasks are a subset of pending tasks; do not add these bars into a total."
        rows={[
          {
            label: "Completed tasks",
            value: completed,
            detail: `${completed} tasks`,
          },
          {
            label: "Pending tasks",
            value: pending,
            detail: `${pending} tasks`,
          },
          {
            label: "Overdue tasks",
            value: overdue,
            detail: `${overdue} tasks`,
          },
        ]}
      />
    );
  }
  if (data.items.length === 0) return null;
  if (measure === "monthly")
    return <MonthlyGraphs data={data as Responses["monthly"]} />;
  const progress = data as
    Responses["departments"] | Responses["events"] | Responses["promotion"];
  return (
    <Bars
      title={`${MEASURES[measure]} comparison`}
      unit="completion (%)"
      maximum={100}
      note={
        "page" in data
          ? "This authorized page only, in server ID order. No ranking or combined percentage."
          : "Returned promotion channels only. No missing channels or combined percentage."
      }
      rows={progress.items.map((row) => ({
        label:
          "channel" in row
            ? `Channel: ${row.channel.toLowerCase().replaceAll("_", " ")}`
            : `Subject: ${row.id}`,
        value: row.percent,
        detail:
          row.percent === null
            ? `No eligible work (${row.completed} / ${row.total})`
            : `${row.percent}% (${row.completed} / ${row.total} completed / eligible)`,
      }))}
    />
  );
}
