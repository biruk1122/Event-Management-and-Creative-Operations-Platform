"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  accessKey,
  useCurrentAccess,
} from "@/features/auth/api/access-queries";
import { NotificationsRequestError } from "../api/notifications-gateway";

import {
  useNotificationsFeed,
  useUnreadCount,
} from "../api/notifications-queries";

const RECENT_PREVIEW_COUNT = 2;

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
  const unread = useUnreadCount(access);
  const feed = useNotificationsFeed(access);
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
  const recent = (feed.data?.pages[0]?.items ?? []).slice(
    0,
    RECENT_PREVIEW_COUNT,
  );
  const unreadCount = unread.data ?? 0;

  return (
    <div className={inline ? "flex" : "flex justify-end px-5 py-3"}>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open notifications">
            <Bell aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>
              {unread.isPending || feed.isPending
                ? "Loading notifications…"
                : unread.isError || feed.isError
                  ? "Notifications could not load."
                  : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`}
            </DialogDescription>
          </DialogHeader>
          {unread.isError || feed.isError ? (
            <div role="alert" className="space-y-3">
              <p>Try again to recover your notification preview.</p>
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
            <p role="status">Loading notifications…</p>
          ) : recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              You have no notifications yet.
            </p>
          ) : (
            <ul aria-label="Recent notifications" className="space-y-3">
              {recent.map((item) => (
                <li
                  key={item.id}
                  className="border-border rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            className="text-sm underline underline-offset-4"
          >
            View all notifications
          </Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
