"use client";

import { useDeferredValue, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LoaderCircle, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  campaignStatusLabel,
  type CampaignStatus,
} from "@/features/campaigns/lib/campaigns-types";
import {
  eventStatusLabel,
  eventTypeLabel,
  type EventStatus,
  type EventType,
} from "@/features/events/lib/events-types";
import { APP_TIME_ZONE, formatInZone } from "@/lib/app-timezone";

import {
  listUpcomingPromotionEvents,
  PromotionWorkspaceRequestError,
  type PromotionEvent,
} from "../api/promotion-workspace-gateway";

function when(event: PromotionEvent): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  const start = formatInZone(event.startAt, options, APP_TIME_ZONE);
  return event.endAt
    ? `${start} – ${formatInZone(event.endAt, options, APP_TIME_ZONE)}`
    : start;
}

/**
 * Event Promotions (EVE-234): the upcoming events the Promotion team works
 * toward, with the promotion campaigns linked to each. Read-only: the
 * event's own department keeps every change, and a campaign is linked to
 * an event from the campaign itself.
 */
export function PromotionEventsView({ userId }: { userId: string }) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const events = useQuery({
    queryKey: ["promotion-workspace", userId, "events", term],
    queryFn: ({ signal }) =>
      listUpcomingPromotionEvents(term ? { search: term } : {}, signal),
    retry: false,
    staleTime: 30_000,
  });

  return (
    <section aria-label="Event promotions" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-sm space-y-2">
          <Label htmlFor={searchId}>Search</Label>
          <Input
            id={searchId}
            type="search"
            value={search}
            placeholder="Event name or location"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <p className="text-muted-foreground max-w-md text-sm">
          Events are managed by their own department. Link a campaign to an
          event from the campaign&apos;s details.
        </p>
      </div>

      {events.isPending ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading upcoming events…
        </p>
      ) : events.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {events.error instanceof PromotionWorkspaceRequestError &&
            events.error.status === 403
              ? "You do not have permission to see upcoming events."
              : "Upcoming events could not be loaded."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void events.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : events.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {term
            ? "No upcoming events match this search."
            : "No upcoming events scheduled."}
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {events.data.map((event) => (
            <li key={event.id} className="space-y-2 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {eventTypeLabel(event.eventType as EventType)} ·{" "}
                    {eventStatusLabel(event.status as EventStatus)}
                    {event.departmentName ? ` · ${event.departmentName}` : ""}
                    {event.organizerName ? ` · ${event.organizerName}` : ""}
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays aria-hidden="true" className="size-4" />
                  {when(event)}
                </span>
                {event.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden="true" className="size-4" />
                    {event.location}
                  </span>
                ) : null}
              </p>
              {event.campaigns.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No promotion campaign linked yet.
                </p>
              ) : (
                <ul
                  aria-label={`Promotion campaigns for ${event.name}`}
                  className="flex flex-wrap gap-2"
                >
                  {event.campaigns.map((campaign) => (
                    <li
                      key={campaign.id}
                      className="bg-muted rounded-full px-3 py-1 text-xs"
                    >
                      {campaign.name} ·{" "}
                      {campaignStatusLabel(campaign.status as CampaignStatus)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
