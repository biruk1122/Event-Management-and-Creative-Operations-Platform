"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  campaignStatusLabel,
  type CampaignStatus,
} from "@/features/campaigns/lib/campaigns-types";
import {
  partnerStatusLabel,
  type PartnerStatus,
} from "@/features/partners/lib/partners-types";
import { APP_TIME_ZONE, formatInZone } from "@/lib/app-timezone";

import {
  getPromotionOverview,
  PromotionWorkspaceRequestError,
  type PromotionOverview as Overview,
} from "../api/promotion-workspace-gateway";
import type { PromotionSection } from "../lib/promotion-workspace-access";

// The charting library is large; load it only when a chart is shown.
const StatusCountChart = dynamic(
  () => import("./promotion-overview-charts").then((m) => m.StatusCountChart),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="text-muted-foreground text-sm">
        Loading chart…
      </p>
    ),
  },
);

const METRIC_LABELS: Record<string, string> = {
  REACH: "Reach",
  ENGAGEMENT: "Engagement",
  TICKETS_SOLD: "Tickets sold",
  ATTENDANCE: "Attendance",
  OTHER: "Other",
};

const ACTIVE_STATUSES = new Set(["APPROVED", "ACTIVE", "PAUSED"]);

const number = new Intl.NumberFormat("en");

function amount(value: string, currency: string): string {
  const parsed = Number(value);
  return `${currency} ${Number.isFinite(parsed) ? parsed.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}`;
}

function eventDate(iso: string): string {
  return formatInZone(
    iso,
    { weekday: "short", month: "short", day: "numeric", year: "numeric" },
    APP_TIME_ZONE,
  );
}

/**
 * The Promotion overview (EVE-234): where the department's work stands, in a
 * compact summary and two charts. Every figure is counted by the API from
 * recorded data the viewer can read; a section the viewer cannot read is
 * left out rather than shown as zero.
 */
export function PromotionOverview({
  userId,
  onNavigate,
}: {
  userId: string;
  onNavigate: (section: PromotionSection) => void;
}) {
  const overview = useQuery({
    queryKey: ["promotion-workspace", userId, "overview"],
    queryFn: ({ signal }) => getPromotionOverview(signal),
    retry: false,
    staleTime: 30_000,
  });

  if (overview.isPending) {
    return (
      <p role="status" className="flex gap-2 text-sm">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading the Promotion overview…
      </p>
    );
  }
  if (overview.isError) {
    const denied =
      overview.error instanceof PromotionWorkspaceRequestError &&
      overview.error.status === 403;
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {denied
            ? "You do not have access to the Promotion overview."
            : "The Promotion overview could not be loaded."}
        </span>
        {denied ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void overview.refetch()}
          >
            Try again
          </Button>
        )}
      </div>
    );
  }
  return <OverviewBody data={overview.data} onNavigate={onNavigate} />;
}

function OverviewBody({
  data,
  onNavigate,
}: {
  data: Overview;
  onNavigate: (section: PromotionSection) => void;
}) {
  const count = (status: string) =>
    data.campaignsByStatus.find((row) => row.status === status)?.count ?? 0;
  const active = data.campaignsByStatus
    .filter((row) => ACTIVE_STATUSES.has(row.status))
    .reduce((sum, row) => sum + row.count, 0);
  const tickets = data.performance.find((row) => row.key === "TICKETS_SOLD");

  return (
    <div className="space-y-6">
      <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4">
        <Figure label="Campaigns" value={data.totalCampaigns} />
        <Figure
          label="Active"
          value={active}
          hint="Approved, active or paused"
        />
        <Figure label="Completed" value={count("COMPLETED")} />
        <Figure label="Upcoming events" value={data.upcomingEventCount} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="promotion-overview-campaigns"
          className="space-y-2"
        >
          <h3 id="promotion-overview-campaigns" className="text-sm font-medium">
            Campaigns by status
          </h3>
          {data.totalCampaigns === 0 ? (
            <p className="text-muted-foreground text-sm">
              No promotion campaigns yet.
            </p>
          ) : (
            <StatusCountChart
              title="Campaigns by status"
              rows={data.campaignsByStatus.map((row) => ({
                label: campaignStatusLabel(row.status as CampaignStatus),
                count: row.count,
              }))}
            />
          )}
        </section>

        <section
          aria-labelledby="promotion-overview-partners"
          className="space-y-2"
        >
          <h3 id="promotion-overview-partners" className="text-sm font-medium">
            Partnerships by status
          </h3>
          {data.partnershipsByStatus === null ? (
            <p className="text-muted-foreground text-sm">
              Partnerships are not shared with you.
            </p>
          ) : data.partnershipsByStatus.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No partnerships recorded yet.
            </p>
          ) : (
            <StatusCountChart
              title="Partnerships by status"
              rows={data.partnershipsByStatus.map((row) => ({
                label: partnerStatusLabel(row.status as PartnerStatus),
                count: row.count,
              }))}
            />
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="promotion-overview-budget"
          className="space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="promotion-overview-budget" className="text-sm font-medium">
              Budget and expenses
            </h3>
            {data.budget !== null ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onNavigate("budget")}
              >
                Open Budget
              </Button>
            ) : null}
          </div>
          {data.budget === null ? (
            <p className="text-muted-foreground text-sm">
              Campaign budgets are not shared with you.
            </p>
          ) : data.budget.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No campaign budgets set yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Budget and expenses by currency
                </caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Currency
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      Allocated
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      Approved spend
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-right font-medium"
                    >
                      Pending
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.budget.map((row) => (
                    <tr key={row.currency}>
                      <th
                        scope="row"
                        className="px-3 py-2 text-left font-normal"
                      >
                        {row.currency}
                        <span className="text-muted-foreground block text-xs">
                          {row.campaignCount}{" "}
                          {row.campaignCount === 1 ? "campaign" : "campaigns"}
                          {row.overBudgetCount > 0
                            ? ` · ${row.overBudgetCount} over budget`
                            : ""}
                        </span>
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {amount(row.allocated, row.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {amount(row.approved, row.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {amount(row.pending, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="promotion-overview-performance"
          className="space-y-2"
        >
          <h3
            id="promotion-overview-performance"
            className="text-sm font-medium"
          >
            Performance indicators
          </h3>
          {data.performance.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No indicators recorded yet. Record reach, engagement or tickets on
              a campaign to see them here.
            </p>
          ) : (
            <dl className="divide-y rounded-lg border">
              {data.performance.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                >
                  <dt>{METRIC_LABELS[row.key] ?? row.key}</dt>
                  <dd className="text-right">
                    <span className="font-medium tabular-nums">
                      {number.format(Number(row.value))}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      latest of {row.campaignCount}{" "}
                      {row.campaignCount === 1 ? "campaign" : "campaigns"}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {data.performance.length > 0 && !tickets ? (
            <p className="text-muted-foreground text-xs">
              No ticketing data available.
            </p>
          ) : null}
        </section>
      </div>

      <section
        aria-labelledby="promotion-overview-events"
        className="space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id="promotion-overview-events" className="text-sm font-medium">
            Next events
          </h3>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => onNavigate("event-promotions")}
          >
            All upcoming events
          </Button>
        </div>
        {data.nextEvents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No upcoming events scheduled.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.nextEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">{event.name}</span>
                <span className="text-muted-foreground text-xs">
                  {eventDate(event.startAt)}
                  {event.location ? ` · ${event.location}` : ""}
                  {` · ${event.campaigns.length === 0 ? "No promotion campaign yet" : `${event.campaigns.length} promotion ${event.campaigns.length === 1 ? "campaign" : "campaigns"}`}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">
        {number.format(value)}
      </dd>
      {hint ? <dd className="text-muted-foreground text-xs">{hint}</dd> : null}
    </div>
  );
}
