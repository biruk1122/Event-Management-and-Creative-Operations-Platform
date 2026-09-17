"use client";

import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import {
  NOTIFICATION_TYPE_LABELS,
  type MutableNotificationType,
  type NotificationItem,
  type NotificationPreference,
} from "../lib/notifications-types";

export type NotificationsViewState =
  "ready" | "loading" | "error" | "reconnecting" | "disabled";

export interface NotificationsCenterProps {
  items: readonly NotificationItem[];
  unreadCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  preferences: readonly NotificationPreference[];
  state: NotificationsViewState;
  onRetry: () => void;
  onLoadMore: () => void;
  onMarkRead: (id: string) => void;
  onTogglePreference: (type: MutableNotificationType, muted: boolean) => void;
}

function relativeDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NotificationsCenter({
  items,
  unreadCount,
  hasMore,
  loadingMore,
  preferences,
  state,
  onRetry,
  onLoadMore,
  onMarkRead,
  onTogglePreference,
}: NotificationsCenterProps) {
  const [showUnread, setShowUnread] = useState(false);
  const interactionsDisabled = state === "disabled";
  // The feed endpoint has no server-side unread filter, so this only
  // narrows the pages already loaded - it is not a separate query.
  const visibleItems = useMemo(
    () => (showUnread ? items.filter((item) => item.readAt === null) : items),
    [items, showUnread],
  );

  if (state === "loading") return <p role="status">Loading notifications…</p>;
  if (state === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Notifications could not load</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Try again to recover your notification feed.</p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {state === "reconnecting" ? (
        <Alert>
          <AlertTitle>Reconnecting to live updates</AlertTitle>
          <AlertDescription>
            Your saved feed remains available while we reconnect.
          </AlertDescription>
        </Alert>
      ) : null}
      {interactionsDisabled ? (
        <Alert>
          <AlertTitle>
            Notification actions are temporarily unavailable
          </AlertTitle>
          <AlertDescription>
            Your saved feed remains visible while access is restored.
          </AlertDescription>
        </Alert>
      ) : null}
      <section
        aria-labelledby="notification-feed-heading"
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="notification-feed-heading"
              className="text-lg font-semibold"
            >
              Notifications
            </h2>
            <p className="text-muted-foreground text-sm">
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showUnread}
              disabled={interactionsDisabled}
              onCheckedChange={(checked) => setShowUnread(checked === true)}
            />
            Unread only
          </label>
        </div>
        {visibleItems.length === 0 ? (
          <p
            role="status"
            className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-sm"
          >
            You have no {showUnread ? "unread " : ""}notifications.
          </p>
        ) : (
          <ol className="space-y-3" aria-label="Notification feed">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <article className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-sm">{item.body}</p>
                    <p className="text-muted-foreground text-xs">
                      {NOTIFICATION_TYPE_LABELS[item.type]} ·{" "}
                      {relativeDate(item.createdAt)}
                    </p>
                  </div>
                  {item.readAt === null ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={interactionsDisabled}
                      onClick={() => onMarkRead(item.id)}
                    >
                      Mark as read
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-sm">Read</span>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
        {hasMore ? (
          <Button
            variant="outline"
            disabled={interactionsDisabled || loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Loading…" : "Load more notifications"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">End of notifications.</p>
        )}
      </section>
      <section
        aria-labelledby="notification-preferences-heading"
        className="space-y-4"
      >
        <div>
          <h2
            id="notification-preferences-heading"
            className="text-lg font-semibold"
          >
            Notification preferences
          </h2>
          <p className="text-muted-foreground text-sm">
            Choose which reminder-style notifications appear in this feed.
          </p>
        </div>
        <ul
          className="divide-border rounded-xl border"
          aria-label="Notification preferences"
        >
          {preferences.map((preference) => (
            <li
              key={preference.type}
              className="flex items-center justify-between gap-4 p-4"
            >
              <Label htmlFor={`preference-${preference.type}`}>
                {NOTIFICATION_TYPE_LABELS[preference.type]}
              </Label>
              <Checkbox
                id={`preference-${preference.type}`}
                checked={!preference.muted}
                disabled={interactionsDisabled}
                onCheckedChange={(checked) =>
                  onTogglePreference(preference.type, checked !== true)
                }
                aria-label={`${NOTIFICATION_TYPE_LABELS[preference.type]} enabled`}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
