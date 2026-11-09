"use client";

import {
  CategoryBarChart,
  type CategoryBarDatum,
} from "@/features/analytics/components/analytics-chart-kit";

/**
 * EVE-234: the overview's count charts. Kept in their own module so the
 * charting library loads only when the overview shows a chart.
 */
export function StatusCountChart({
  title,
  rows,
}: {
  title: string;
  rows: readonly { label: string; count: number }[];
}) {
  const data: CategoryBarDatum[] = rows.map((row) => ({
    label: row.label,
    value: row.count,
    detail: `${row.count}`,
  }));
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <CategoryBarChart title={title} data={data} maxValue={max} />;
}
