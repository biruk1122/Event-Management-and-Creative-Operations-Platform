"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import {
  analyticsAbilities,
  type AnalyticsFilters,
} from "../lib/analytics-presentation";
import type { AnalyticsRequestError } from "../api/analytics-gateway";
import { AnalyticsManager } from "./analytics-manager";

export function AnalyticsScreen() {
  const access = useCurrentAccess(),
    client = useQueryClient();
  const [blocked, setBlocked] = useState<{
    epoch: number;
    error: AnalyticsRequestError;
  } | null>(null);
  // Only user-entered filters survive controller remounts; never metric data.
  const [draft, setDraft] = useState<{
    userId: string;
    selection: string;
    filters: AnalyticsFilters;
  } | null>(null);
  const failClosed = useCallback(
    (error: AnalyticsRequestError) =>
      setBlocked({ epoch: access.dataUpdatedAt, error }),
    [access.dataUpdatedAt],
  );
  const allowed = access.data
    ? Object.values(analyticsAbilities(access.data)).some(Boolean)
    : false;
  const denial = blocked?.epoch === access.dataUpdatedAt ? blocked.error : null;
  const hidden =
    access.isFetching || access.isError || !access.data || !allowed || !!denial;
  useEffect(() => {
    if (hidden) {
      void client.cancelQueries({ queryKey: ["analytics"] });
      client.removeQueries({ queryKey: ["analytics"] });
    } else {
      const stale = {
        queryKey: ["analytics"],
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[1] !== access.data?.userId ||
          query.queryKey[3] !== access.dataUpdatedAt,
      };
      void client.cancelQueries(stale);
      client.removeQueries(stale);
    }
  }, [hidden, client, access.data?.userId, access.dataUpdatedAt]);
  if (access.isPending || access.isFetching)
    return <p role="status">Checking current analytics permissions…</p>;
  if (access.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>
          We could not verify your analytics access. Cached metrics are hidden.
        </p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
      </div>
    );
  if (access.data === null || denial?.status === 401)
    return (
      <div role="alert" className="space-y-3">
        <p>Your session expired. Sign in to view analytics.</p>
        <Link href="/login?next=%2Fanalytics" className="underline">
          Sign in
        </Link>
        <Button variant="outline" onClick={() => void access.refetch()}>
          I have signed in
        </Button>
      </div>
    );
  if (!allowed || denial)
    return (
      <div role="alert" className="space-y-3">
        <p>{denial?.message ?? "You do not have access to analytics."}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
        <Link href="/" className="block underline">
          Back to home
        </Link>
      </div>
    );
  if (!access.data) return null;
  return (
    <AnalyticsManager
      key={`${access.data.userId}:${access.dataUpdatedAt}`}
      access={access.data}
      epoch={access.dataUpdatedAt}
      onAuthorizationError={failClosed}
      savedDraft={draft?.userId === access.data.userId ? draft : null}
      onDraftChange={(selection, filters) =>
        setDraft({ userId: access.data!.userId, selection, filters })
      }
    />
  );
}
