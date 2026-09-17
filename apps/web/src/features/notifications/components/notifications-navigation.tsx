"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

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

function NotificationsBell({
  access,
}: {
  access: NonNullable<ReturnType<typeof useCurrentAccess>["data"]>;
}) {
  const unread = useUnreadCount(access);
  const feed = useNotificationsFeed(access);
  const recent = (feed.data?.pages[0]?.items ?? []).slice(
    0,
    RECENT_PREVIEW_COUNT,
  );
  const unreadCount = unread.data ?? 0;

  return (
    <nav aria-label="Utility navigation" className="flex justify-end px-5 py-3">
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
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          {recent.length === 0 ? (
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
    </nav>
  );
}
