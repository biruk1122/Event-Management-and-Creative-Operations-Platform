"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  NOTIFICATION_TYPE_LABELS,
  type MutableNotificationType,
  type NotificationItem,
  type NotificationPreference,
} from "../lib/notifications-types";
import { notificationHref } from "../lib/notifications-link";
import {
  notificationAppearance,
  notificationDate,
  notificationGroup,
} from "../lib/notifications-presentation";
import styles from "./notifications-center.module.css";
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
  onRemove: (id: string) => void;
  onMarkAllRead: () => void;
  onTogglePreference: (type: MutableNotificationType, muted: boolean) => void;
  markingAll?: boolean;
  pendingIds?: readonly string[];
  removingIds?: readonly string[];
  pendingPreferences?: readonly string[];
  actionError?: string | null;
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
  onRemove,
  onMarkAllRead,
  onTogglePreference,
  markingAll = false,
  pendingIds = [],
  removingIds = [],
  pendingPreferences = [],
  actionError,
}: NotificationsCenterProps) {
  const [showUnread, setShowUnread] = useState(true);
  const [now] = useState(() => new Date());
  const interactionsDisabled = state === "disabled";
  const visibleItems = useMemo(
    () => (showUnread ? items.filter((item) => item.readAt === null) : items),
    [items, showUnread],
  );
  const groups = useMemo(() => {
    const result = new Map<string, NotificationItem[]>();
    for (const item of visibleItems) {
      const group = notificationGroup(item.createdAt, now);
      result.set(group, [...(result.get(group) ?? []), item]);
    }
    return result;
  }, [visibleItems, now]);
  const header = (
    <header className={styles.pageHeader}>
      <div>
        <h1>Notifications</h1>
        <p>Stay on top of your events, tasks and messages.</p>
      </div>
      <Button
        variant="outline"
        className={styles.markAll}
        disabled={
          interactionsDisabled ||
          markingAll ||
          pendingIds.length > 0 ||
          unreadCount === 0 ||
          state === "loading" ||
          state === "error"
        }
        onClick={onMarkAllRead}
        aria-busy={markingAll}
      >
        {markingAll ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <CheckCheck aria-hidden="true" />
        )}
        {markingAll ? "Marking all read…" : "Mark all as read"}
      </Button>
    </header>
  );
  if (state === "loading")
    return (
      <div className={styles.center}>
        {header}
        <div className={styles.loading} role="status">
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          Loading notifications…
        </div>
      </div>
    );
  if (state === "error")
    return (
      <div className={styles.center}>
        {header}
        <Alert variant="destructive">
          <AlertTitle>Notifications could not load</AlertTitle>
          <AlertDescription>
            <p>Try again to recover your notification feed.</p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  return (
    <div className={styles.center}>
      {header}
      {state === "reconnecting" && (
        <Alert>
          <AlertTitle>Reconnecting to live updates</AlertTitle>
          <AlertDescription>
            Your saved feed remains available while we reconnect.
          </AlertDescription>
        </Alert>
      )}
      {interactionsDisabled && (
        <Alert>
          <AlertTitle>
            Notification actions are temporarily unavailable
          </AlertTitle>
          <AlertDescription>
            Your saved feed remains visible while access is restored.
          </AlertDescription>
        </Alert>
      )}
      {actionError && (
        <p role="alert" className={styles.error}>
          {actionError}
        </p>
      )}
      <div className={styles.columns}>
        <section
          aria-labelledby="notification-feed-heading"
          className={styles.feed}
        >
          <div className={styles.feedHeader}>
            <div className={styles.feedTitle}>
              <h2 id="notification-feed-heading">Your feed</h2>
              <span
                className={unreadCount === 0 ? styles.allRead : styles.badge}
              >
                {unreadCount === 0 ? "All read" : `${unreadCount} unread`}
              </span>
              <span className="sr-only">
                {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className={styles.filters}
              role="group"
              aria-label="Notification filter"
            >
              <button
                type="button"
                aria-pressed={!showUnread}
                onClick={() => setShowUnread(false)}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={showUnread}
                onClick={() => setShowUnread(true)}
              >
                Unread <span className={styles.filterCount}>{unreadCount}</span>
              </button>
            </div>
          </div>
          {visibleItems.length === 0 ? (
            <div className={styles.empty} role="status">
              <div className={styles.emptyHalo}>
                <span>
                  <Bell aria-hidden="true" />
                </span>
              </div>
              <h3>
                {unreadCount === 0
                  ? "You’re all caught up"
                  : "Nothing here just yet"}
              </h3>
              <p>
                {showUnread && unreadCount > 0 && hasMore
                  ? "No unread notifications in the loaded history. Load more to check older notifications."
                  : showUnread
                    ? "No unread notifications. New reminders will land here as soon as something needs your attention."
                    : "Your events, tasks and messages will appear here when there’s an update."}
              </p>
              {showUnread && (
                <Button
                  variant="outline"
                  onClick={() => setShowUnread(false)}
                  className={styles.showAll}
                >
                  Show all notifications
                </Button>
              )}
            </div>
          ) : (
            <ol className={styles.list} aria-label="Notification feed">
              {[...groups].flatMap(([group, entries]) =>
                entries.map((item, index) => {
                  const appearance = notificationAppearance(item.type),
                    Icon = appearance.icon,
                    href = notificationHref(item);
                  const pending = markingAll || pendingIds.includes(item.id),
                    disabled = interactionsDisabled || pending;
                  const message = (
                    <span className={styles.message}>
                      {item.title !== NOTIFICATION_TYPE_LABELS[item.type] && (
                        <span className={styles.itemTitle}>{item.title}</span>
                      )}
                      <span className={styles.body}>{item.body}</span>
                    </span>
                  );
                  return (
                    <li key={item.id}>
                      {index === 0 && (
                        <h3 className={styles.groupLabel}>{group}</h3>
                      )}
                      <article
                        className={`${styles.item} ${item.readAt === null ? styles.unread : ""}`}
                      >
                        <span
                          className={styles.icon}
                          data-tone={appearance.tone}
                        >
                          <Icon aria-hidden="true" />
                        </span>
                        <div className={styles.itemContent}>
                          <div className={styles.itemMeta}>
                            <span>{NOTIFICATION_TYPE_LABELS[item.type]}</span>
                            <span className={styles.date}>
                              <time
                                dateTime={item.createdAt}
                                title={new Date(
                                  item.createdAt,
                                ).toLocaleString()}
                              >
                                {notificationDate(item.createdAt, now)}
                              </time>
                              {item.readAt === null && (
                                <span className={styles.unreadDot}>
                                  <span className="sr-only">Unread</span>
                                </span>
                              )}
                            </span>
                          </div>
                          {href && !interactionsDisabled ? (
                            <Link
                              href={href}
                              aria-label={`${appearance.action}: ${item.title}`}
                              className={styles.itemLink}
                              onClick={() => {
                                if (!pending && item.readAt === null)
                                  onMarkRead(item.id);
                              }}
                            >
                              {message}
                              <span className={styles.view}>
                                {appearance.action}
                                <ChevronRight aria-hidden="true" />
                              </span>
                            </Link>
                          ) : (
                            message
                          )}
                          <div className={styles.itemActions}>
                            <button
                              type="button"
                              className={styles.remove}
                              disabled={disabled}
                              aria-busy={removingIds.includes(item.id)}
                              onClick={() => onRemove(item.id)}
                              aria-label={`Remove notification: ${item.title}`}
                            >
                              {removingIds.includes(item.id) ? (
                                <>
                                  <LoaderCircle
                                    className="animate-spin"
                                    aria-hidden="true"
                                  />
                                  Removing…
                                </>
                              ) : (
                                <>
                                  <Trash2 aria-hidden="true" />
                                  Remove
                                </>
                              )}
                            </button>
                            {item.readAt === null ? (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onMarkRead(item.id)}
                              >
                                {pending && !removingIds.includes(item.id) ? (
                                  <>
                                    <LoaderCircle
                                      aria-hidden="true"
                                      className="animate-spin"
                                    />
                                    Marking read…
                                  </>
                                ) : (
                                  "Mark as read"
                                )}
                              </button>
                            ) : (
                              <span className={styles.read}>
                                <CheckCheck aria-hidden="true" />
                                Read
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                }),
              )}
            </ol>
          )}
          {hasMore ? (
            <div className={styles.more}>
              <Button
                variant="outline"
                disabled={interactionsDisabled || loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? "Loading…" : "Load more notifications"}
              </Button>
            </div>
          ) : (
            visibleItems.length > 0 && (
              <p className={styles.end}>End of notifications.</p>
            )
          )}
        </section>
        <aside
          className={styles.preferences}
          aria-labelledby="notification-preferences-heading"
        >
          <div className={styles.preferencesHeading}>
            <h2 id="notification-preferences-heading">Reminders</h2>
            <span>
              {preferences.filter((p) => !p.muted).length} of{" "}
              {preferences.length} on
            </span>
          </div>
          <p className={styles.preferencesIntro}>
            Pick which reminders show up in your feed.
          </p>
          <ul aria-label="Notification preferences">
            {preferences.map((preference) => {
              const appearance = notificationAppearance(preference.type),
                Icon = appearance.icon;
              return (
                <li key={preference.type}>
                  <span
                    className={styles.preferenceIcon}
                    data-tone={appearance.tone}
                  >
                    <Icon aria-hidden="true" />
                  </span>
                  <label
                    htmlFor={`preference-${preference.type}`}
                    className={styles.preferenceLabel}
                  >
                    <span>{NOTIFICATION_TYPE_LABELS[preference.type]}</span>
                    <span>{appearance.description}</span>
                  </label>
                  <button
                    id={`preference-${preference.type}`}
                    type="button"
                    role="switch"
                    aria-checked={!preference.muted}
                    aria-label={`${NOTIFICATION_TYPE_LABELS[preference.type]} enabled`}
                    className={styles.switch}
                    disabled={
                      interactionsDisabled ||
                      pendingPreferences.includes(preference.type)
                    }
                    aria-busy={pendingPreferences.includes(preference.type)}
                    onClick={() =>
                      onTogglePreference(preference.type, !preference.muted)
                    }
                  >
                    <span />
                  </button>
                </li>
              );
            })}
          </ul>
          {preferences.length === 0 && (
            <p className={styles.preferencesIntro}>
              No reminder preferences are available.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
