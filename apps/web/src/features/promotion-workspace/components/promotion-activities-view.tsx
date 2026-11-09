"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listAllPromotionActivities,
  PromotionRequestError,
} from "@/features/promotion/api/promotion-gateway";
import {
  PROMOTION_CHANNEL_LABELS,
  PROMOTION_CHANNELS,
  type PromotionChannel,
} from "@/features/promotion/promotion-types";
import {
  activityStatusLabel,
  type CampaignActivityStatus,
} from "@/features/campaigns/lib/campaigns-types";
import { APP_TIME_ZONE, formatInZone } from "@/lib/app-timezone";

/** One activity as the cross-campaign list returns it. */
type ListedActivity = {
  activity: {
    id: string;
    name: string;
    status: CampaignActivityStatus;
    startAt: string | null;
  };
  channel: PromotionChannel;
  campaignId: string;
  campaignName: string;
  location: string | null;
};

type Mode = "list" | "calendar";
type SortKey = "START_AT" | "NAME";

const STATUSES: readonly CampaignActivityStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

const CONTROL =
  "border-input bg-background text-foreground focus-visible:ring-ring min-h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

/** The day an activity starts, in the app timezone, as shown to people. */
function dayLabel(iso: string | null): string {
  if (!iso) return "No date yet";
  return formatInZone(
    iso,
    { weekday: "long", year: "numeric", month: "short", day: "numeric" },
    APP_TIME_ZONE,
  );
}

/** The key a day groups under: the calendar day in the app timezone. */
function dayKey(iso: string | null): string {
  if (!iso) return "none";
  return formatInZone(
    iso,
    { year: "numeric", month: "2-digit", day: "2-digit" },
    APP_TIME_ZONE,
  );
}

/**
 * The Promotional Activities section (EVE-231): every promotion activity the
 * viewer can read, across campaigns, as a filterable list or grouped by the day
 * each one starts. The server applies the filters and the department rules.
 */
export function PromotionActivitiesView({ mode }: { mode: Mode }) {
  const ids = {
    search: useId(),
    channel: useId(),
    status: useId(),
    sort: useId(),
  };
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<PromotionChannel | "ALL">("ALL");
  const [status, setStatus] = useState<CampaignActivityStatus | "ALL">("ALL");
  const [sort, setSort] = useState<SortKey>("START_AT");
  const [items, setItems] = useState<ListedActivity[] | null>(null);
  const [failure, setFailure] = useState<"denied" | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listAllPromotionActivities(
      {
        ...(channel !== "ALL" ? { channel } : {}),
        ...(status !== "ALL" ? { status } : {}),
        ...(search.trim() ? { search } : {}),
        sort,
        pageSize: 100,
      },
      controller.signal,
    ).then(
      (page) => {
        if (controller.signal.aborted) return;
        setFailure(null);
        setItems(page.items as ListedActivity[]);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setItems(null);
        setFailure(
          error instanceof PromotionRequestError &&
            (error.status === 401 || error.status === 403)
            ? "denied"
            : "error",
        );
      },
    );
    return () => controller.abort();
  }, [search, channel, status, sort, attempt]);

  const groups = mode === "calendar" && items ? groupByDay(items) : null;

  return (
    <section
      aria-label={
        mode === "calendar" ? "Promotion calendar" : "Promotional activities"
      }
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={ids.search}>Search</Label>
          <Input
            id={ids.search}
            type="search"
            value={search}
            placeholder="Activity name"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.channel}>Channel</Label>
          <select
            id={ids.channel}
            className={CONTROL}
            value={channel}
            onChange={(event) =>
              setChannel(event.target.value as PromotionChannel | "ALL")
            }
          >
            <option value="ALL">All channels</option>
            {PROMOTION_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {PROMOTION_CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.status}>Status</Label>
          <select
            id={ids.status}
            className={CONTROL}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as CampaignActivityStatus | "ALL")
            }
          >
            <option value="ALL">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {activityStatusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.sort}>Sort by</Label>
          <select
            id={ids.sort}
            className={CONTROL}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            <option value="START_AT">Start date</option>
            <option value="NAME">Name</option>
          </select>
        </div>
      </div>

      {failure === "denied" ? (
        <p role="alert" className="text-sm">
          You do not have permission to see promotional activities.
        </p>
      ) : failure === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>Promotional activities could not be loaded.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : items === null ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading promotional activities…
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No promotional activities match these filters yet.
        </p>
      ) : mode === "list" ? (
        <ul className="divide-border divide-y rounded-lg border">
          {items.map((row) => (
            <li
              key={row.activity.id}
              className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{row.activity.name}</p>
                <p className="text-muted-foreground text-xs">
                  {row.campaignName} · {PROMOTION_CHANNEL_LABELS[row.channel]}
                  {row.location ? ` · ${row.location}` : ""}
                </p>
              </div>
              <div className="text-muted-foreground text-xs">
                {activityStatusLabel(row.activity.status)}
                {row.activity.startAt
                  ? ` · ${dayLabel(row.activity.startAt)}`
                  : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          {(groups ?? []).map((group) => (
            <section
              key={group.key}
              aria-label={group.label}
              className="space-y-2"
            >
              <h3 className="text-sm font-medium">{group.label}</h3>
              <ul className="space-y-2">
                {group.rows.map((row) => (
                  <li key={row.activity.id} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{row.activity.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {row.campaignName} ·{" "}
                      {PROMOTION_CHANNEL_LABELS[row.channel]} ·{" "}
                      {activityStatusLabel(row.activity.status)}
                      {row.location ? ` · ${row.location}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/** Groups activities by the UTC day they start; undated ones come last. */
function groupByDay(rows: ListedActivity[]) {
  const map = new Map<
    string,
    { key: string; label: string; rows: ListedActivity[] }
  >();
  for (const row of rows) {
    const key = dayKey(row.activity.startAt);
    const group = map.get(key) ?? {
      key,
      label: dayLabel(row.activity.startAt),
      rows: [],
    };
    group.rows.push(row);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "none") return 1;
    if (b.key === "none") return -1;
    return a.key.localeCompare(b.key);
  });
}
