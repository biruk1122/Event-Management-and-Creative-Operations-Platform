"use client";

import type { Route } from "next";
import Link from "next/link";

import { useCurrentAccess } from "@/features/auth/api/access-queries";

// The optional catch-all segments (`[[...conversationId]]`, `[[...channelId]]`)
// make the typed-route template require a trailing slug; the bare parent
// path is still a real, valid route.
const DM_HREF = "/discuss/dm" as Route;
const CHANNELS_HREF = "/discuss/channels" as Route;

export function DiscussNavigation() {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some(
      (grant) =>
        grant.permissionKey === "conversation.read" ||
        grant.permissionKey === "channel.participate",
    ) ?? false;
  if (access.isError || !allowed) {
    return null;
  }
  return (
    <nav aria-label="Discuss" className="px-5 py-3">
      <Link href={DM_HREF} className="text-sm underline underline-offset-4">
        Direct messages
      </Link>{" "}
      <Link
        href={CHANNELS_HREF}
        className="text-sm underline underline-offset-4"
      >
        Channels
      </Link>
    </nav>
  );
}
