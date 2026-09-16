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
import { NOTIFICATION_FIXTURE } from "../lib/notifications-fixtures";

export function NotificationsNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === "notification.read",
    ) ?? false;
  if (access.isError || !allowed) return null;
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
              {
                NOTIFICATION_FIXTURE.filter((item) => item.readAt === null)
                  .length
              }{" "}
              unread notifications.
            </DialogDescription>
          </DialogHeader>
          <ul aria-label="Recent notifications" className="space-y-3">
            {NOTIFICATION_FIXTURE.slice(0, 2).map((item) => (
              <li
                key={item.id}
                className="border-border rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">{item.title}</p>
                <p className="text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
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
