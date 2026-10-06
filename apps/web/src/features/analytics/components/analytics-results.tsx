import type { ReactNode } from "react";
import type { components } from "@event-platform/api-client";
import {
  rateLabel,
  type Measure,
  type Responses,
} from "../lib/analytics-presentation";

type Counts = components["schemas"]["AnalyticsWorkCounts"];
type Progress = components["schemas"]["EntityProgress"];

function Completion({
  completed,
  total,
  percent,
}: Pick<Progress, "completed" | "total" | "percent">) {
  return (
    <div className="space-y-1">
      <p className="font-medium tabular-nums">
        {rateLabel(percent)}{" "}
        <span className="text-muted-foreground font-normal">
          ({completed} of {total})
        </span>
      </p>
      {percent !== null ? (
        <meter
          aria-label="Completion percentage"
          min={0}
          max={100}
          value={percent}
          className="h-3 w-full max-w-48"
        >
          {percent}%
        </meter>
      ) : null}
    </div>
  );
}

function ScrollTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div
      role="region"
      aria-label={`${caption} table`}
      tabIndex={0}
      className="focus-visible:outline-ring max-w-full overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <table className="w-full text-left text-sm">
        <caption className="text-muted-foreground px-4 py-3 text-left">
          {caption}
        </caption>
        <thead className="bg-muted">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-3 whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {row.map((cell, column) =>
                column === 0 ? (
                  <th
                    key={column}
                    scope="row"
                    className="max-w-48 px-4 py-3 font-medium break-all"
                  >
                    {cell}
                  </th>
                ) : (
                  <td key={column} className="px-4 py-3 tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsResults({
  measure,
  data,
}: {
  measure: Measure;
  data: Responses[Measure];
}) {
  const period =
    "from" in data
      ? `${data.from} to ${data.toExclusive} (end excluded, UTC)`
      : "Current all-time work; not limited by creation dates";
  let content: ReactNode;
  if ("counts" in data) {
    const counts: Counts = data.counts;
    content = (
      <>
        <Completion {...counts} />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries({
            "Eligible tasks": counts.total,
            Completed: counts.completed,
            Pending: counts.pending,
            Overdue: counts.overdue,
          }).map(([label, value]) => (
            <div key={label} className="bg-muted/40 rounded-lg border p-4">
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {counts.total === 0 ? (
          <p>No eligible tasks in this creation period. Adjust the dates.</p>
        ) : null}
      </>
    );
  } else if (data.items.length === 0) {
    content = (
      <p className="rounded-lg border border-dashed p-6">
        No matching data in your permitted scope. Adjust the filters; this is
        not a permission denial.
      </p>
    );
  } else if (
    measure === "monthly" &&
    "from" in data &&
    "month" in data.items[0]!
  ) {
    const monthly = data as Responses["monthly"];
    content = (
      <ScrollTable
        caption="Monthly activity — separate source counts"
        headers={[
          "Month (UTC)",
          "Tasks created",
          "Events created",
          "Projects created",
          "Productions created",
          "Campaigns created",
          "Tasks completed",
        ]}
        rows={monthly.items.map((row) => [
          row.month,
          row.tasksCreated,
          row.eventsCreated,
          row.projectsCreated,
          row.productionsCreated,
          row.campaignsCreated,
          row.tasksCompleted,
        ])}
      />
    );
  } else if (measure === "promotion") {
    const promotion = data as Responses["promotion"];
    content = (
      <>
        <p className="text-sm break-all">
          Promotion campaign: {promotion.campaignId}
        </p>
        <ScrollTable
          caption="Promotion channel delivery"
          headers={["Channel", "Completed / eligible", "Delivery rate"]}
          rows={promotion.items.map((row) => [
            row.channel.toLowerCase().replaceAll("_", " "),
            `${row.completed} / ${row.total}`,
            rateLabel(row.percent),
          ])}
        />
      </>
    );
  } else {
    const page = data as Responses["departments"] | Responses["events"];
    content = (
      <ScrollTable
        caption="Authorized entities — deterministic ID order"
        headers={[
          "Subject ID",
          "Completed / eligible",
          "Completion",
          ...(measure === "departments" || measure === "employees"
            ? ["Pending", "Overdue"]
            : []),
        ]}
        rows={page.items.map((row) => [
          row.id,
          `${row.completed} / ${row.total}`,
          <Completion key={row.id} {...row} />,
          ...("pending" in row ? [row.pending, row.overdue] : []),
        ])}
      />
    );
  }
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm">{period}</p>
      <p className="text-muted-foreground text-sm">
        Refreshed{" "}
        <time dateTime={data.asOf}>
          {data.asOf.replace("T", " ").replace("Z", " UTC")}
        </time>
        . Live current state, not a historical or globally atomic snapshot.
      </p>
      {content}
      {measure === "employees" ? (
        <p className="text-muted-foreground text-sm">
          Current explicit assignments. Shared tasks count once per employee;
          employee totals are not additive. No ranking or weighted score.
        </p>
      ) : null}
      {["tasks", "departments", "employees"].includes(measure) ? (
        <p className="text-muted-foreground text-sm">
          Tasks created in the period, using current status and ownership.
          Cancelled work excluded; Under Review remains pending. Overdue is
          pending work due before the server refresh time.
        </p>
      ) : null}
      {measure === "events" ? (
        <p className="text-muted-foreground text-sm">
          Direct event-workspace tasks only, not related project work or event
          lifecycle status.
        </p>
      ) : null}
      {measure === "campaigns" ? (
        <p className="text-muted-foreground text-sm">
          Marketing campaign activities, excluding cancelled activities.
        </p>
      ) : null}
      {measure === "promotion" ? (
        <p className="text-muted-foreground text-sm">
          Promotion-extension activities only, excluding cancelled work. Not
          reach, revenue, or ROI.
        </p>
      ) : null}
      {measure === "monthly" ? (
        <p className="text-muted-foreground text-sm">
          Creation counts include cancelled records and must not be added into
          an activity total. Completions count distinct task transitions per UTC
          month, regardless of creation date. Current-month observations may be
          partial.
        </p>
      ) : null}
    </div>
  );
}
