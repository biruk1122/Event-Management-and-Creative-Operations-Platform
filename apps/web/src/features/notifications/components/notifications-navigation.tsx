"use client";

import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  CheckCheck,
  MessageSquare,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  accessKey,
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useRealtimeConnection,
  type ConnectRealtime,
} from "@/features/realtime";

import {
  notificationsKeys,
  useNotificationsFeed,
  useNotificationsMutations,
  useUnreadCount,
} from "../api/notifications-queries";
import { NotificationsRequestError } from "../api/notifications-gateway";
import { notificationHref } from "../lib/notifications-link";
import { ClearNotificationsDialog } from "./clear-notifications-dialog";
import styles from "./notifications-navigation.module.css";

/** How many unread notifications the bell lists before "See all". */
const PREVIEW_COUNT = 6;

/** The `notification.invalidated` frame: a signal to refetch, never data. */
const LIVE_EVENT = "notification.invalidated";

function notificationTime(createdAt: string) {
  const seconds = Math.round(
    (new Date(createdAt).getTime() - Date.now()) / 1000,
  );
  if (!Number.isFinite(seconds)) return "Recently";
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "Just now";
  if (Math.abs(seconds) < 3600)
    return relative.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400)
    return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86400), "day");
}

export function NotificationsNavigation({
  connect,
}: {
  /** Testing seam for the live connection; defaults to the real `/realtime` handshake. */
  connect?: ConnectRealtime | undefined;
}) {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === "notification.read",
    ) ?? false;
  if (access.isError || !allowed || !access.data) return null;
  return <NotificationsBell access={access.data} connect={connect} />;
}

export function NotificationsBell({
  access,
  inline = false,
  connect,
}: {
  access: CurrentAccess;
  inline?: boolean;
  connect?: ConnectRealtime | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const client = useQueryClient();
  const keys = notificationsKeys(access);
  const unread = useUnreadCount(access);
  const feed = useNotificationsFeed(access);
  const mutations = useNotificationsMutations(access);

  // New notifications arrive over the live connection. The frame itself is
  // never trusted as data; receiving it only refetches the REST queries.
  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.all });
  }, [client, keys.all]);
  const reconcileRef = useRef(reconcile);
  useEffect(() => {
    reconcileRef.current = reconcile;
  });
  const connection = useRealtimeConnection(connect, (event) => {
    if (event === LIVE_EVENT) reconcileRef.current();
  });
  const everConnectedRef = useRef(false);
  const connectionStatus = connection.state.status;
  useEffect(() => {
    if (connectionStatus !== "connected") return;
    if (everConnectedRef.current) reconcileRef.current();
    everConnectedRef.current = true;
  }, [connectionStatus]);

  useEffect(() => {
    for (const error of [unread.error, feed.error]) {
      if (
        error instanceof NotificationsRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        void client.invalidateQueries({ queryKey: accessKey });
        return;
      }
    }
  }, [client, unread.error, feed.error]);

  // Only unread notifications are listed; read ones live on the full page.
  const unreadItems = (feed.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((item) => item.readAt === null)
    .slice(0, PREVIEW_COUNT);
  const unreadCount = unread.data ?? 0;
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = feed;

  // Pull further pages only while the list is short of the unread count.
  useEffect(() => {
    if (
      open &&
      unreadCount > unreadItems.length &&
      unreadItems.length < PREVIEW_COUNT &&
      hasNextPage &&
      !isFetching &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [
    open,
    unreadCount,
    unreadItems.length,
    hasNextPage,
    isFetching,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  const loading = unread.isPending || feed.isPending;
  const failed = unread.isError || feed.isError;
  const hasUnread = !loading && !failed && unreadCount > 0;
  const clearing = mutations.clearUnread.isPending;

  return (
    <div className={inline ? "flex" : "flex justify-end px-5 py-3"}>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative inline-flex">
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open notifications"
            >
              <Bell aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          {unreadCount > 0 ? (
            <Badge
              aria-hidden="true"
              className="border-background bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 min-w-6 justify-center rounded-full border-2 px-1 py-0 text-xs leading-none font-bold"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
        </div>
        <PopoverContent
          className={styles.panel}
          sideOffset={12}
          aria-label="Notifications"
        >
          <div className={styles.header}>
            <div className={styles.headerIcon} aria-hidden="true">
              <Bell />
              {unreadCount > 0 ? <span className={styles.dot} /> : null}
            </div>
            <div className={styles.heading}>
              <h2>Notifications</h2>
              <p>
                {loading
                  ? "Loading notifications…"
                  : failed
                    ? "Notifications could not load."
                    : unreadCount === 0
                      ? "No unread notifications"
                      : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          <div className={styles.body}>
            {failed ? (
              <Alert variant="destructive">
                <AlertTitle>Notifications could not load</AlertTitle>
                <AlertDescription>
                  <p>Try again to recover your notifications.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void unread.refetch();
                      void feed.refetch();
                    }}
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : loading ? (
              <p role="status" className="text-muted-foreground text-sm">
                Loading notifications…
              </p>
            ) : unreadCount === 0 ? (
              <div className={styles.empty}>
                <CheckCheck aria-hidden="true" />
                <p>You’re all caught up.</p>
                <span>New notifications will appear here.</span>
              </div>
            ) : unreadItems.length === 0 ? (
              <p role="status" className="text-muted-foreground text-sm">
                Loading unread notifications…
              </p>
            ) : (
              <ul aria-label="Unread notifications" className="space-y-3">
                {unreadItems.map((item) => {
                  const href = notificationHref(item) ?? "/notifications";
                  const Icon = item.type.includes("MESSAGE")
                    ? MessageSquare
                    : item.type.startsWith("MEETING") ||
                        item.type === "EVENT_REMINDER"
                      ? CalendarDays
                      : ClipboardList;
                  return (
                    <li key={item.id} className={styles.row}>
                      <PopoverClose asChild>
                        <Link
                          href={href}
                          className={styles.item}
                          onClick={() => mutations.markRead.mutate(item.id)}
                        >
                          <span className={styles.itemIcon} aria-hidden="true">
                            <Icon />
                            <span className={styles.dot} />
                          </span>
                          <span className={styles.itemContent}>
                            <span className={styles.itemTitle}>
                              {item.title}
                            </span>
                            <span className={styles.itemDescription}>
                              {item.body}
                            </span>
                            <span className={styles.time}>
                              {item.senderName ? (
                                <span className={styles.sender}>
                                  {item.senderName} ·
                                </span>
                              ) : null}
                              <Clock3 aria-hidden="true" />
                              <time
                                dateTime={item.createdAt}
                                title={new Date(
                                  item.createdAt,
                                ).toLocaleString()}
                              >
                                {notificationTime(item.createdAt)}
                              </time>
                            </span>
                          </span>
                          <span className={styles.view}>
                            View
                            <ChevronRight aria-hidden="true" />
                          </span>
                        </Link>
                      </PopoverClose>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={styles.markRead}
                        aria-label={`Mark “${item.title}” as read`}
                        disabled={mutations.markRead.isPending}
                        onClick={() => mutations.markRead.mutate(item.id)}
                      >
                        <Check aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={styles.footer}>
            {hasUnread ? (
              <Button
                type="button"
                variant="outline"
                className={styles.clearAll}
                disabled={clearing}
                aria-busy={clearing}
                onClick={() => setConfirmOpen(true)}
              >
                <CheckCheck aria-hidden="true" />
                Clear notifications
              </Button>
            ) : null}
            <PopoverClose asChild>
              <Link href="/notifications" className={styles.viewAll}>
                See all notifications
                <ChevronRight aria-hidden="true" />
              </Link>
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
      <ClearNotificationsDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={clearing}
        error={mutations.clearUnread.isError}
        onConfirm={() =>
          mutations.clearUnread.mutate(undefined, {
            onSuccess: () => setConfirmOpen(false),
          })
        }
      />
    </div>
  );
}
