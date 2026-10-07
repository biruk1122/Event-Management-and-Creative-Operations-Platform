"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canEnter,
  visibleCards,
  type Audience,
  type DashboardAccess,
  type DashboardPanel,
} from "../lib/dashboard-presentation";
import { DashboardResults } from "./dashboard-results";

export interface DashboardWorkspaceProps {
  access: DashboardAccess | null;
  audience: Audience;
  accessStatus?: "ready" | "checking" | "error" | "signedOut";
  panels?: Record<string, DashboardPanel>;
  day?: string;
  staleKeys?: string[];
  refreshing?: boolean;
  notice?: string;
  onRefresh?: () => void;
  onRetry?: (key: string) => void;
  onAudienceChange?: (audience: Audience) => void;
  onApply?: (filters: { day: string; promotionCampaignId: string }) => void;
  onCheckAccess?: () => void;
}
export function DashboardWorkspace({
  access,
  audience,
  accessStatus = "ready",
  panels = {},
  day = "",
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
  const [draftDay, setDraftDay] = useState(day);
  const [campaign, setCampaign] = useState("");
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
  if (!canEnter(access, audience))
    return (
      <p role="alert" className="rounded-xl border p-5">
        You do not have access to this dashboard.
      </p>
    );
  const cards = visibleCards(access, audience).filter(
    (item) => panels[item.key]?.state !== "denied",
  );
  const groups = [...new Set(cards.map((item) => item.group))];
  const disconnected = cards.some(
    (item) => !panels[item.key] || panels[item.key]?.state === "disconnected",
  );
  return (
    <div className="min-w-0 space-y-6">
      <a
        href={`#${id}-results`}
        className="sr-only rounded-md underline focus:not-sr-only"
      >
        Skip to dashboard results
      </a>
      <section
        aria-label="Dashboard controls"
        className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
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
            onClick={onRefresh}
            disabled={!onRefresh || refreshing}
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
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const parsedDay = new Date(`${draftDay}T00:00:00Z`);
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(draftDay) ||
              !Number.isFinite(parsedDay.getTime()) ||
              parsedDay.toISOString().slice(0, 10) !== draftDay
            ) {
              setError("Choose a valid UTC day.");
              return;
            }
            if (
              campaign &&
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                campaign,
              )
            ) {
              setError("Enter a valid promotion campaign UUID.");
              return;
            }
            setError("");
            onApply?.({
              day: draftDay,
              promotionCampaignId: audience === "management" ? campaign : "",
            });
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
          <Button disabled={!onApply || refreshing}>Apply filters</Button>
        </form>
        {audience === "management" ? (
          <p id={`${id}-promotion`} className="text-muted-foreground text-sm">
            Choose a campaign to see promotion performance; no campaign is
            guessed.
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
        {groups.map((group) => (
          <section
            key={group}
            aria-labelledby={`${id}-${group}`}
            className="min-w-0 space-y-3"
          >
            <h2 id={`${id}-${group}`} className="text-xl font-semibold">
              {group}
            </h2>
            <div
              className={`grid min-w-0 gap-4 ${group === "Overview" ? "sm:grid-cols-2 lg:grid-cols-3" : "lg:grid-cols-2"}`}
            >
              {cards
                .filter((item) => item.group === group)
                .map((item) => {
                  const panel = panels[item.key] ?? {
                    state: "disconnected" as const,
                  };
                  const supplied = "data" in panel;
                  return (
                    <article
                      key={item.key}
                      aria-labelledby={`${id}-${item.key}`}
                      className="bg-card min-w-0 space-y-3 rounded-xl border p-4 sm:p-5"
                    >
                      <h3 id={`${id}-${item.key}`} className="font-semibold">
                        {item.title}
                      </h3>
                      {"scope" in panel && panel.scope ? (
                        <p className="text-muted-foreground text-sm">
                          Scope: {panel.scope}
                        </p>
                      ) : null}
                      {"asOf" in panel && panel.asOf ? (
                        <p className="text-muted-foreground text-sm break-words">
                          Refreshed{" "}
                          <time dateTime={panel.asOf}>{panel.asOf} (UTC)</time>
                        </p>
                      ) : null}
                      {staleKeys.includes(item.key) && supplied ? (
                        <p role="status">
                          Stale: last successful results in this account and
                          scope. Refresh to update.
                        </p>
                      ) : null}
                      {panel.state === "loading" ? (
                        <p role="status">Loading {item.title.toLowerCase()}…</p>
                      ) : panel.state === "disconnected" ? (
                        <p className="text-muted-foreground text-sm">
                          Not connected. Results will appear after live
                          integration.
                        </p>
                      ) : panel.state === "selectionRequired" ? (
                        <p>Choose a promotion campaign above to see results.</p>
                      ) : panel.state === "unavailable" ? (
                        <div className="space-y-2">
                          <p role="status">
                            This card is unavailable. Other cards remain usable.
                          </p>
                          {panel.requestId ? (
                            <p className="text-sm break-all">
                              Support reference: {panel.requestId}
                            </p>
                          ) : null}
                          {panel.retryable && onRetry ? (
                            <Button
                              variant="outline"
                              onClick={() => onRetry(item.key)}
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
                            <p role="status">
                              Partial results: some sources could not be loaded.
                              The successful sources are shown.
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
                          <DashboardResults card={panel} cardKey={item.key} />
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
                              onClick={() => onRetry(item.key)}
                            >
                              Retry {item.title.toLowerCase()}
                            </Button>
                          ) : null}
                        </>
                      )}
                      {item.href &&
                      (panel.state === "ready" ||
                        panel.state === "empty" ||
                        panel.state === "partial") ? (
                        <Link
                          href={item.href}
                          className="text-sm underline underline-offset-4"
                        >
                          Open {item.title.toLowerCase()} workspace
                        </Link>
                      ) : null}
                    </article>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
