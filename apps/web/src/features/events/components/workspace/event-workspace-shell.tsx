"use client";

import {
  createContext,
  useContext,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { cn } from "@/lib/utils";

import { getEvent } from "../../api/events-gateway";
import { eventKeys } from "../../api/events-queries";
import {
  eventAbilities,
  canReadEvents,
  type EventAbilities,
} from "../../lib/event-access";
import {
  activeWorkspaceTab,
  EVENT_WORKSPACE_TABS,
  eventReference,
  eventsListingPath,
  eventWorkspacePath,
  workspaceSchedule,
} from "../../lib/event-workspace";
import {
  eventStatusLabel,
  eventTypeLabel,
  personName,
  type Event,
} from "../../lib/events-types";

interface EventWorkspaceValue {
  event: Event;
  access: CurrentAccess;
  abilities: EventAbilities;
}

const EventWorkspaceContext = createContext<EventWorkspaceValue | null>(null);

/** The selected event and the caller's abilities, for any workspace tab. */
export function useEventWorkspace(): EventWorkspaceValue {
  const value = useContext(EventWorkspaceContext);
  if (!value) {
    throw new Error("useEventWorkspace needs an EventWorkspaceShell.");
  }
  return value;
}

const AVATAR_PREVIEW = 3;

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** The manager and individually assigned people. */
function workspacePeople(event: Event): string[] {
  const people = [
    ...(event.manager ? [event.manager] : []),
    ...event.participants.filter((person) => person.id !== event.manager?.id),
  ];
  return people.map(personName);
}

function PeopleAvatars({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, AVATAR_PREVIEW);
  const hidden = names.length - shown.length;
  return (
    <div role="group" aria-label={names.join(", ")} className="flex">
      {shown.map((name, index) => (
        <span
          key={`${name}-${index}`}
          title={name}
          className={cn(
            "bg-card text-foreground border-accent flex size-8 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
            index > 0 && "-ml-2",
          )}
        >
          {initials(name)}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="bg-card text-foreground border-accent -ml-2 flex h-8 items-center rounded-full border-2 px-2 text-[11px] font-semibold">
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}

function WorkspaceHeader({
  event,
  canUpdate,
}: {
  event: Event;
  canUpdate: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tab = activeWorkspaceTab(event.id, pathname);

  function backToListing(click: MouseEvent<HTMLAnchorElement>) {
    click.preventDefault();
    router.push(eventsListingPath());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Event workspace
          </h1>
          <nav aria-label="Event location">
            <ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
              <li>
                <Link
                  href="/events"
                  onClick={backToListing}
                  className="underline-offset-4 hover:underline"
                >
                  Events
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="min-w-0 break-words">{event.name}</li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{tab.label}</li>
            </ol>
          </nav>
        </div>
        {canUpdate ? (
          <Button variant="outline" asChild>
            <Link
              href={
                `${eventWorkspacePath(event.id, "details")}?edit=1` as never
              }
            >
              <Settings2 aria-hidden="true" data-icon="inline-start" />
              Edit event
            </Link>
          </Button>
        ) : null}
      </div>

      <section
        aria-label="Event summary"
        className="border-border bg-accent/50 flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
      >
        <div className="min-w-0 space-y-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            {eventTypeLabel(event.eventType)} / {eventReference(event)}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {event.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {workspaceSchedule(event)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Badge variant="outline">{eventStatusLabel(event.status)}</Badge>
          <PeopleAvatars names={workspacePeople(event)} />
        </div>
      </section>

      <nav aria-label="Event workspace" className="border-border border-b">
        <ul className="-mb-px flex gap-6 overflow-x-auto">
          {EVENT_WORKSPACE_TABS.map((item) => {
            const active = item.segment === tab.segment;
            return (
              <li key={item.label} className="shrink-0">
                <Link
                  href={eventWorkspacePath(event.id, item.segment)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 inline-flex min-h-11 items-center border-b-2 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                    active
                      ? "border-primary text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Loads the selected event once for every tab, and frames them with the
 * header and tab bar. The API decides whether this caller may see the event. */
export function EventWorkspaceShell({
  eventId,
  children,
}: {
  eventId: string;
  children: ReactNode;
}) {
  const accessQuery = useCurrentAccess();
  const access = accessQuery.data ?? null;
  const allowed = access ? canReadEvents(access) : false;
  const keys = access ? eventKeys(access) : null;

  const eventQuery = useQuery({
    queryKey: keys?.detail(eventId) ?? ["events", "pending"],
    queryFn: ({ signal }) => getEvent(eventId, signal),
    enabled: allowed,
    retry: false,
  });

  const event = eventQuery.data ?? null;
  const value = useMemo(
    () =>
      access && event
        ? { access, event, abilities: eventAbilities(access) }
        : null,
    [access, event],
  );

  if (accessQuery.isPending || (allowed && eventQuery.isPending)) {
    return <p role="status">Loading event…</p>;
  }
  if (!allowed) {
    return <p role="alert">You do not have access to this area.</p>;
  }
  if (eventQuery.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>We could not load this event.</p>
        <Button variant="outline" onClick={() => void eventQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!value) {
    return (
      <div role="alert" className="space-y-2">
        <p>This event does not exist, or you do not have access to it.</p>
        <Link href="/events" className="text-sm underline underline-offset-4">
          Go to events
        </Link>
      </div>
    );
  }

  return (
    <EventWorkspaceContext.Provider value={value}>
      <div className="min-w-0 space-y-6 wrap-anywhere">
        <WorkspaceHeader
          event={value.event}
          canUpdate={value.abilities.canUpdate}
        />
        {children}
      </div>
    </EventWorkspaceContext.Provider>
  );
}
