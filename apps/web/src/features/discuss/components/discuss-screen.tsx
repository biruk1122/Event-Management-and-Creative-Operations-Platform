"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { DiscussManager } from "./discuss-manager";

export interface DiscussScreenProps {
  kind: "dm" | "channel";
  initialConversationId: string | null;
}

const KIND_META = {
  dm: {
    permissionKey: "conversation.read",
    loginHref: "/login?next=%2Fdiscuss%2Fdm",
    // Matches `discussKeys`'s own `kind` segment exactly, so a dropped
    // session actually clears the cache the manager reads from.
    queryKey: ["discuss", "dm"],
  },
  channel: {
    permissionKey: "channel.participate",
    loginHref: "/login?next=%2Fdiscuss%2Fchannels",
    queryKey: ["discuss", "channel"],
  },
} as const;

export function DiscussScreen({
  kind,
  initialConversationId,
}: DiscussScreenProps) {
  const meta = KIND_META[kind];
  const access = useCurrentAccess();
  const client = useQueryClient();
  const allowed =
    access.data?.grants.some(
      (grant) => grant.permissionKey === meta.permissionKey,
    ) ?? false;

  // Drop any Discuss cache the moment the caller loses read access or their
  // session ends, so a re-grant starts from authoritative data.
  useEffect(() => {
    if (access.data === null || (access.isSuccess && !allowed)) {
      void client.cancelQueries({ queryKey: meta.queryKey });
      client.removeQueries({ queryKey: meta.queryKey });
    }
  }, [access.data, access.isSuccess, allowed, client, meta.queryKey]);

  if (access.isPending) {
    return <p role="status">Checking permissions…</p>;
  }

  if (access.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
      </div>
    );
  }

  if (access.data === null) {
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Your unsaved input is kept in this tab.</p>
        <Link
          href={meta.loginHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline underline-offset-4"
        >
          Sign in in another tab
        </Link>
        <Button variant="outline" onClick={() => void access.refetch()}>
          I have signed in
        </Button>
      </div>
    );
  }

  if (!allowed) {
    return <p role="alert">You do not have access to this area.</p>;
  }

  return (
    <DiscussManager
      key={access.data.userId}
      kind={kind}
      access={access.data}
      initialConversationId={initialConversationId}
    />
  );
}
