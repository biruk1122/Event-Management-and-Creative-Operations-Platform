"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  Layers3,
  MessageSquare,
  ListChecks,
} from "lucide-react";
import { destinations } from "@/components/shell/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canEnter,
  visibleCards,
  type Audience,
  type DashboardAccess,
  type DashboardPanel,
} from "../lib/dashboard-presentation";
import { cardIcons } from "../lib/dashboard-presentation-icons";
import { DashboardIconBadge } from "./dashboard-icon-badge";
import { DashboardResults } from "./dashboard-results";
import { dashboardContext } from "../lib/dashboard-context";
import styles from "./dashboard-workspace.module.css";
import {
  dashboardFilterError,
  defaultDashboardFilters,
  type DashboardFilters,
} from "../lib/dashboard-selection";

export interface DashboardWorkspaceProps {
  access: DashboardAccess | null;
  audience: Audience;
  accessStatus?: "ready" | "checking" | "error" | "signedOut";
  panels?: Record<string, DashboardPanel>;
  day?: string;
  filters?: DashboardFilters;
  initialDraft?: DashboardFilters;
  onDraftChange?: (filters: DashboardFilters) => void;
  staleKeys?: string[];
  refreshing?: boolean;
  notice?: string;
  onRefresh?: () => void;
  onRetry?: (key: string) => void;
  onAudienceChange?: (audience: Audience) => void;
  onApply?: (filters: DashboardFilters) => void;
  onCheckAccess?: () => void;
}
const groupPresentation = {
  Overview: {
    icon: Layers3,
    description: "Current organizational totals from authorized sources.",
  },
  Today: {
    icon: CalendarDays,
    description: "Schedules, deadlines and work needing attention.",
  },
  Communication: {
    icon: MessageSquare,
    description: "Your conversations and permitted meeting previews.",
  },
  Analytics: {
    icon: BarChart3,
    description:
      "Delivery measures with their actual periods, units and scope.",
  },
  "My work": {
    icon: ListChecks,
    description: "Your assignments, personal records and recent activity.",
  },
};
export function DashboardWorkspace({
  access,
  audience,
  accessStatus = "ready",
  panels = {},
  day = "",
  filters,
  initialDraft,
  onDraftChange,
  staleKeys = [],
  refreshing = false,
  notice,
  onRefresh,
  onRetry,
  onAudienceChange,
  onApply,
  onCheckAccess,
}: DashboardWorkspaceProps) {
  const id = useId();
  const draft = initialDraft ?? filters;
  const [draftDay, setDraftDay] = useState(draft?.day ?? day);
  const [campaign, setCampaign] = useState(draft?.promotionCampaignId ?? "");
  const [from, setFrom] = useState(draft?.from ?? "");
  const [toExclusive, setToExclusive] = useState(draft?.toExclusive ?? "");
  const [months, setMonths] = useState(draft?.months ?? 3);
  const [limit, setLimit] = useState(draft?.limit ?? 5);
  useEffect(() => {
    onDraftChange?.({
      day: draftDay,
      promotionCampaignId: campaign,
      from,
      toExclusive,
      months,
      limit,
    });
  }, [onDraftChange, draftDay, campaign, from, toExclusive, months, limit]);
  const [error, setError] = useState("");
  if (accessStatus !== "ready" || !access)
    return (
      <section
        className="space-y-3 rounded-xl border p-5"
        aria-label="Dashboard access"
      >
        <p role={accessStatus === "checking" ? "status" : "alert"}>
          {accessStatus === "checking"
            ? "Checking dashboard access…"
            : accessStatus === "signedOut"
              ? "Your session ended. Sign in to see your dashboard."
              : "We could not verify dashboard access. Protected results are hidden."}
        </p>
        {accessStatus === "signedOut" ? (
          <Link href="/login?next=%2Fdashboard" className="underline">
            Sign in
          </Link>
        ) : onCheckAccess ? (
          <Button onClick={onCheckAccess}>Check access again</Button>
        ) : null}
      </section>
    );
  const context = dashboardContext(access);
  if (!canEnter(access, audience))
    return (
      <section role="alert" className="bg-card space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">
          {context?.scope === "Not assigned"
            ? context.title
            : "Dashboard access unavailable"}
        </h2>
        <p>
          {context?.scope === "Not assigned"
            ? context.description
            : "You do not have access to this dashboard."}
        </p>
      </section>
    );
  const cards = visibleCards(access, audience).filter(
    (item) => panels[item.key]?.state !== "denied",
  );
  const groups = [...new Set(cards.map((item) => item.group))];
  const routes = destinations(access);
  const departmentAreas = [
    {
      name: "Production",
      description: "Production projects and delivery",
      href: "/projects/production",
    },
    {
      name: "Marketing",
      description: "Marketing campaigns and creative work",
      href: "/campaigns?type=MARKETING",
    },
    {
      name: "Promotion",
      description: "Promotion campaigns and activities",
      href: "/campaigns?type=PROMOTION",
    },
    {
      name: "Manager / Event & Office Manager",
      description: "Events and office coordination",
      href: "/events",
    },
  ] as const;
  const permittedRoutes = new Set(routes.map((item) => item.href));
  const disconnected = cards.some(
    (item) => !panels[item.key] || panels[item.key]?.state === "disconnected",
  );
  return (
    <div className={`${styles.workspace} min-w-0 space-y-8`}>
      <a
        href={`#${id}-results`}
        className="sr-only rounded-md underline focus:not-sr-only"
      >
        Skip to dashboard results
      </a>
      <section
        className={styles.introduction}
        aria-labelledby={`${id}-view-title`}
      >
        <div>
          <p className="text-primary mb-2 text-sm font-semibold">
            {context ? `${context.role} · ${context.scope}` : "Your dashboard"}
          </p>
          <h2
            id={`${id}-view-title`}
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {context
              ? context.role === "Super Admin"
                ? "Company overview"
                : "Your department workspace"
              : audience === "management"
                ? "Management overview"
                : "Your work today"}
          </h2>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
            {context?.description ??
              (audience === "management"
                ? "Review permitted organizational results and scoped operational work. Each card identifies its own scope and refresh time."
                : "Focus on what needs your attention. These results remain limited to your own assignments, records and conversation memberships.")}
          </p>
        </div>
        {routes.some(
          (route) => route.href === "/reports" || route.href === "/analytics",
        ) ? (
          <nav
            aria-label="Dashboard related workspaces"
            className="flex flex-wrap gap-2"
          >
            {routes
              .filter(
                (route) =>
                  route.href === "/reports" || route.href === "/analytics",
              )
              .map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className={styles.destination}
                >
                  {route.label}
                </Link>
              ))}
          </nav>
        ) : null}
      </section>
      {access.role === "SUPER_ADMIN" ? (
        <section aria-labelledby={`${id}-departments`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id={`${id}-departments`} className="text-lg font-semibold">
                Department workspaces
              </h3>
              <p className="text-muted-foreground text-sm">
                Choose an area of the company to manage.
              </p>
            </div>
            {routes.some((route) => route.href === "/departments") ? (
              <Link href="/departments" className={styles.destination}>
                Manage departments
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-center gap-4 @min-[64rem]:gap-5">
            {departmentAreas.map((area) => {
              const available = routes.some(
                (route) => route.href === area.href.split("?")[0],
              );
              return (
                <div
                  key={area.name}
                  className={`${styles.departmentCard} shrink grow-0 basis-96 @min-[40rem]:basis-60 @min-[64rem]:basis-56`}
                >
                  <Layers3
                    aria-hidden="true"
                    className="text-primary mb-4 size-6"
                  />
                  <h4 className="font-semibold">{area.name}</h4>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {area.description}
                  </p>
                  {available ? (
                    <Link
                      href={area.href}
                      className={`${styles.destination} mt-4`}
                    >
                      Open {area.name}
                    </Link>
                  ) : (
                    <p className="text-muted-foreground mt-4 text-sm">
                      Module access is not granted.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {routes.some((route) => route.href === "/users") ? (
            <p className="text-muted-foreground text-sm">
              Assign each manager or member a role and department in{" "}
              <Link
                href="/users"
                className="text-primary underline underline-offset-4"
              >
                Users
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}
      <section
        aria-label="Dashboard controls"
        className={`${styles.controls} bg-card space-y-4 rounded-2xl border p-4 sm:p-6`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor={`${id}-audience`}>Dashboard view</Label>
            <select
              id={`${id}-audience`}
              value={audience}
              disabled={!onAudienceChange || refreshing}
              onChange={(event) =>
                onAudienceChange?.(event.target.value as Audience)
              }
              className="bg-background border-input focus-visible:outline-ring min-h-10 rounded-md border px-3 focus-visible:outline-2"
            >
              {(["management", "employee"] as const)
                .filter((value) => canEnter(access, value))
                .map((value) => (
                  <option key={value} value={value}>
                    {value === "management" ? "Management overview" : "My work"}
                  </option>
                ))}
            </select>
          </div>
          <Button
            type="button"
            onClick={() => {
              if (!refreshing) onRefresh?.();
            }}
            disabled={!onRefresh}
            aria-disabled={refreshing}
            className="aria-disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh dashboard"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled
            aria-describedby={`${id}-export`}
          >
            Export dashboard
          </Button>
        </div>
        <p id={`${id}-export`} className="text-muted-foreground text-sm">
          Export is unavailable: the approved dashboard contract does not
          provide exports.
        </p>
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            const next = {
              ...defaultDashboardFilters(),
              day: draftDay,
              limit,
              ...(audience === "management"
                ? { from, toExclusive, months, promotionCampaignId: campaign }
                : {}),
            };
            const invalid = dashboardFilterError(audience, next);
            if (invalid) {
              setError(invalid);
              return;
            }
            setError("");
            onApply?.(next);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${id}-day`}>Today (UTC)</Label>
            <Input
              id={`${id}-day`}
              type="date"
              value={draftDay}
              onChange={(event) => setDraftDay(event.target.value)}
              disabled={!onApply || refreshing}
              className="w-auto"
            />
          </div>
          {audience === "management" ? (
            <div className="min-w-0 space-y-2">
              <Label htmlFor={`${id}-campaign`}>
                Promotion campaign UUID (optional)
              </Label>
              <Input
                id={`${id}-campaign`}
                value={campaign}
                onChange={(event) => setCampaign(event.target.value)}
                disabled={!onApply || refreshing}
                aria-describedby={`${id}-promotion`}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`${id}-limit`}>Items per list (1–10)</Label>
            <Input
              id={`${id}-limit`}
              type="number"
              min={1}
              max={10}
              step={1}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              disabled={!onApply || refreshing}
              className="w-32"
            />
          </div>
          {audience === "management" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${id}-from`}>Cohort start (UTC)</Label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  disabled={!onApply || refreshing}
                  className="w-auto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-end`}>Cohort end (excluded, UTC)</Label>
                <Input
                  id={`${id}-end`}
                  type="date"
                  value={toExclusive}
                  onChange={(event) => setToExclusive(event.target.value)}
                  disabled={!onApply || refreshing}
                  className="w-auto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-months`}>Monthly buckets (1–12)</Label>
                <Input
                  id={`${id}-months`}
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={months}
                  onChange={(event) => setMonths(Number(event.target.value))}
                  disabled={!onApply || refreshing}
                  className="w-32"
                />
              </div>
            </>
          ) : null}
          <Button disabled={!onApply || refreshing}>Apply filters</Button>
        </form>
        {audience === "management" ? (
          <p id={`${id}-promotion`} className="text-muted-foreground text-sm">
            Choose a campaign to see promotion performance; no campaign is
            guessed.
          </p>
        ) : null}
        {audience === "management" ? (
          <p className="text-muted-foreground text-sm">
            Cohort dates affect task/department analytics only; leave both blank
            for the current UTC month. Maximum 366 days. Monthly buckets end in
            the current, partial UTC month. Lists are bounded previews, not
            paginated full workspaces.
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <p className="text-muted-foreground text-sm">
          {day ? `Applied day: ${day} (UTC). ` : ""}
          {audience === "management"
            ? "Overview totals are current all-time state. Operational cards may have narrower scope."
            : "Your assignments, personal records and conversation memberships only."}{" "}
          Upcoming means the next seven days from the server refresh.
        </p>
      </section>
      {disconnected ? (
        <p role="status" className="bg-muted rounded-lg border p-4">
          Dashboard data is not connected yet (EVE-181). No sample metrics or
          zero totals are shown.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div
        id={`${id}-results`}
        tabIndex={-1}
        className="min-w-0 space-y-6 focus-visible:outline-2"
        aria-busy={refreshing}
      >
        {cards.length === 0 ? (
          <p>
            No dashboard cards are available with your current source
            permissions.
          </p>
        ) : null}
        {groups.map((group) => {
          const { icon: Icon, description } = groupPresentation[group];
          return (
            <section
              key={group}
              aria-labelledby={`${id}-${group}`}
              className="min-w-0 space-y-3"
            >
              <div className="flex items-start gap-3">
                <span className={styles.groupIcon}>
                  <Icon aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2 id={`${id}-${group}`} className="text-xl font-semibold">
                    {group}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {description}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap justify-center gap-4 @min-[64rem]:gap-5">
                {cards
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const panel = panels[item.key] ?? {
                      state: "disconnected" as const,
                    };
                    const supplied = "data" in panel;
                    const icon = cardIcons[item.key];
                    const hasDestination = Boolean(
                      item.href &&
                      permittedRoutes.has(item.href) &&
                      (panel.state === "ready" ||
                        panel.state === "empty" ||
                        panel.state === "partial"),
                    );
                    return (
                      <Card
                        key={item.key}
                        className={`${styles.card} min-w-0 shrink grow-0 basis-80 gap-3 @min-[48rem]:basis-72 ${group === "Overview" ? "@min-[64rem]:basis-88" : "@min-[64rem]:basis-96"} ${hasDestination ? "transition-shadow hover:shadow-md" : ""}`}
                      >
                        <CardHeader className="flex-row items-start gap-3 space-y-0">
                          {icon ? (
                            <DashboardIconBadge
                              icon={icon.icon}
                              tone={icon.tone}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <h3
                              id={`${id}-${item.key}`}
                              className="font-semibold"
                            >
                              {item.title}
                            </h3>
                            {"scope" in panel && panel.scope ? (
                              <p className="text-muted-foreground text-sm">
                                Scope: {panel.scope}
                              </p>
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent>
                          {"asOf" in panel && panel.asOf ? (
                            <p className="text-muted-foreground text-sm break-words">
                              Refreshed{" "}
                              <time dateTime={panel.asOf}>
                                {panel.asOf} (UTC)
                              </time>
                            </p>
                          ) : null}
                          {staleKeys.includes(item.key) && supplied ? (
                            <p
                              role="status"
                              className="flex items-center gap-2"
                            >
                              <Badge variant="warning">Stale</Badge>
                              <span>
                                Stale: last successful results in this account
                                and scope. Refresh to update.
                              </span>
                            </p>
                          ) : null}
                          {panel.state === "loading" ? (
                            <p role="status">
                              Loading {item.title.toLowerCase()}…
                            </p>
                          ) : panel.state === "disconnected" ? (
                            <p className="text-muted-foreground text-sm">
                              Not connected. Results will appear after live
                              integration.
                            </p>
                          ) : panel.state === "selectionRequired" ? (
                            <p>
                              Choose a promotion campaign above to see results.
                            </p>
                          ) : panel.state === "unavailable" ? (
                            <div className="space-y-2">
                              <p role="status">
                                This card is unavailable. Other cards remain
                                usable.
                              </p>
                              {panel.requestId ? (
                                <p className="text-sm break-all">
                                  Support reference: {panel.requestId}
                                </p>
                              ) : null}
                              {panel.retryable && onRetry ? (
                                <Button
                                  variant="outline"
                                  aria-disabled={refreshing}
                                  className="aria-disabled:opacity-50"
                                  onClick={() => {
                                    if (!refreshing) onRetry(item.key);
                                  }}
                                >
                                  Retry {item.title.toLowerCase()}
                                </Button>
                              ) : (
                                <p className="text-sm">
                                  {panel.retryable
                                    ? "Retry will be available after live integration."
                                    : "Retry is not available for this failure."}
                                </p>
                              )}
                            </div>
                          ) : (
                            <>
                              {panel.state === "partial" ? (
                                <p
                                  role="status"
                                  className="flex items-center gap-2"
                                >
                                  <Badge variant="warning">Partial</Badge>
                                  Some sources could not be loaded. The
                                  successful sources are shown.
                                </p>
                              ) : null}
                              {panel.sources ? (
                                <ul className="text-muted-foreground text-sm">
                                  {Object.entries(panel.sources)
                                    .filter(
                                      ([, source]) => source.state !== "denied",
                                    )
                                    .map(([source, value]) => (
                                      <li key={source}>
                                        {source}: {value.state}
                                        {value.retryable ? " (retryable)" : ""}
                                      </li>
                                    ))}
                                </ul>
                              ) : null}
                              <DashboardResults
                                card={panel}
                                cardKey={item.key}
                              />
                              {panel.state === "partial" &&
                              (panel.retryable ||
                                Object.values(panel.sources ?? {}).some(
                                  (source) =>
                                    source.state === "unavailable" &&
                                    source.retryable,
                                )) &&
                              onRetry ? (
                                <Button
                                  variant="outline"
                                  aria-disabled={refreshing}
                                  className="aria-disabled:opacity-50"
                                  onClick={() => {
                                    if (!refreshing) onRetry(item.key);
                                  }}
                                >
                                  Retry {item.title.toLowerCase()}
                                </Button>
                              ) : null}
                            </>
                          )}
                          {hasDestination && item.href ? (
                            <Link
                              href={item.href}
                              className={styles.destination}
                            >
                              Open {item.title.toLowerCase()} workspace
                            </Link>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
