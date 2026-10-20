"use client";

import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  LoaderCircle,
  MessageSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
} from "@/features/auth/api/access-queries";
import { NotificationsRequestError } from "../api/notifications-gateway";
import { notificationHref } from "../lib/notifications-link";
import styles from "./notifications-navigation.module.css";

import {
  useNotificationsFeed,
  useNotificationsMutations,
  useUnreadCount,
} from "../api/notifications-queries";

const RECENT_PREVIEW_COUNT = 2;

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

export function NotificationsNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === "notification.read",
    ) ?? false;
  if (access.isError || !allowed || !access.data) return null;
  return <NotificationsBell access={access.data} />;
}

export function NotificationsBell({
  access,
  inline = false,
}: {
  access: NonNullable<ReturnType<typeof useCurrentAccess>["data"]>;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount(access);
  const feed = useNotificationsFeed(access);
  const mutations = useNotificationsMutations(access);
  const client = useQueryClient();
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
  const recent = (feed.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((item) => item.readAt === null)
    .slice(0, RECENT_PREVIEW_COUNT);
  const unreadCount = unread.data ?? 0;
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = feed;
  useEffect(() => {
    if (
      open &&
      unreadCount > 0 &&
      recent.length < RECENT_PREVIEW_COUNT &&
      hasNextPage &&
      !isFetching &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [
    open,
    unreadCount,
    recent.length,
    hasNextPage,
    isFetching,
    isFetchNextPageError,
    fetchNextPage,
  ]);

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
                {unread.isPending || feed.isPending
                  ? "Loading notifications…"
                  : unread.isError || feed.isError
                    ? "Notifications could not load."
                    : unreadCount === 0
                      ? "No new notifications"
                      : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className={styles.markAll}
              disabled={
                unreadCount === 0 ||
                unread.isPending ||
                feed.isPending ||
                unread.isError ||
                feed.isError ||
                mutations.markAllRead.isPending
              }
              onClick={() => mutations.markAllRead.mutate()}
            >
              {mutations.markAllRead.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {mutations.markAllRead.isPending ? "Marking…" : "Mark all read"}
            </Button>
          </div>
          <div className={styles.body}>
            {mutations.markAllRead.isError ? (
              <p role="alert" className="text-destructive mb-3 text-sm">
                Some notifications could not be marked read. Please try again.
              </p>
            ) : null}
            {unread.isError || feed.isError ? (
              <div role="alert" className="space-y-3">
                <p className="text-sm">
                  Try again to recover your notification preview.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    void unread.refetch();
                    void feed.refetch();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : unread.isPending || feed.isPending ? (
              <p role="status" className="text-muted-foreground text-sm">
                Loading notifications…
              </p>
            ) : recent.length === 0 ? (
              <div className={styles.empty}>
                <Bell aria-hidden="true" />
                <p>No notifications right now.</p>
                <span>You’re all caught up.</span>
              </div>
            ) : (
              <ul aria-label="Recent notifications" className="space-y-3">
                {recent.map((item) => {
                  const href = notificationHref(item) ?? "/notifications";
                  const Icon = item.type.includes("MESSAGE")
                    ? MessageSquare
                    : item.type.startsWith("MEETING") ||
                        item.type === "EVENT_REMINDER"
                      ? CalendarDays
                      : ClipboardList;
                  return (
                    <li key={item.id}>
                      <PopoverClose asChild>
                        <Link
                          href={href}
                          className={styles.item}
                          onClick={() => {
                            if (item.readAt === null)
                              mutations.markRead.mutate(item.id);
                          }}
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
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className={styles.footer}>
            <PopoverClose asChild>
              <Link href="/notifications" className={styles.viewAll}>
                View all notifications
                <ChevronRight aria-hidden="true" />
              </Link>
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
