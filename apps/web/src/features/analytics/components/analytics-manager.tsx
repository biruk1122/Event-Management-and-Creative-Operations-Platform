"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  AnalyticsRequestError,
  fetchAnalytics,
} from "../api/analytics-gateway";
import {
  analyticsAbilities,
  MEASURES,
  type Measure,
  type Panels,
  type Responses,
  type AnalyticsFilters,
} from "../lib/analytics-presentation";
import {
  defaultFilters,
  readSelection,
  selectionUrl,
  type AnalyticsSelection,
} from "../lib/analytics-url";
import { AnalyticsWorkspace } from "./analytics-workspace";

export function analyticsIdentity(access: CurrentAccess, epoch: number) {
  return [
    "analytics",
    access.userId,
    [
      ...new Set(
        access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
      ),
    ]
      .sort()
      .join(","),
    epoch,
  ] as const;
}
export function AnalyticsManager({
  access,
  epoch,
  onAuthorizationError,
  savedDraft,
  onDraftChange,
}: {
  access: CurrentAccess;
  epoch: number;
  onAuthorizationError: (error: AnalyticsRequestError) => void;
  savedDraft: { selection: string; filters: AnalyticsFilters } | null;
  onDraftChange: (selection: string, filters: AnalyticsFilters) => void;
}) {
  const router = useRouter(),
    params = useSearchParams(),
    client = useQueryClient();
  const [defaults] = useState(defaultFilters);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(
    null,
  );
  const allowed = analyticsAbilities(access);
  const fallback =
    (Object.keys(MEASURES) as Measure[]).find((measure) => allowed[measure]) ??
    "tasks";
  const selection = readSelection(params, fallback, defaults);
  const { measure, filters, error } = selection;
  // Paging and permission epochs do not change the applied form filters.
  const draftKey = `${measure}:${JSON.stringify(filters)}`;
  const identity = analyticsIdentity(access, epoch);
  const queryKey = [...identity, measure, selectionUrl(selection)] as const;
  const selectionKey = JSON.stringify(queryKey);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchAnalytics(selection, signal),
    enabled: allowed[measure] && !error,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });
  useEffect(() => {
    if (
      query.error instanceof AnalyticsRequestError &&
      [401, 403].includes(query.error.status)
    )
      onAuthorizationError(query.error);
  }, [query.error, onAuthorizationError]);

  // Previously visited measures may survive an unrelated failure, never an access epoch.
  const panels: Panels = {};
  for (const cached of client.getQueryCache().findAll({ queryKey: identity })) {
    const cachedMeasure = cached.queryKey[4] as Measure;
    if (!allowed[cachedMeasure]) continue;
    if (cached.state.status === "error")
      panels[cachedMeasure] = { state: "error" };
    else if (cached.state.data)
      Object.assign(panels, {
        [cachedMeasure]: {
          state: "ready",
          data: cached.state.data as Responses[Measure],
        },
      });
  }
  Object.assign(panels, {
    [measure]: error
      ? { state: "input", message: error }
      : query.isError
        ? {
            state: "error",
            message:
              query.error instanceof AnalyticsRequestError
                ? query.error.message
                : "The analytics service could not be reached. Try again.",
          }
        : query.isPending
          ? { state: "loading" }
          : { state: "ready", data: query.data },
  });

  const change = (next: AnalyticsSelection) => {
    setNotice(null);
    router.push(selectionUrl(next), { scroll: false });
  };
  if (!allowed[measure])
    return (
      <div role="alert" className="space-y-3">
        <p>
          You do not have access to the requested analytics measure. No metric
          was requested.
        </p>
        <Link href="/analytics" className="underline">
          Choose a permitted view
        </Link>
      </div>
    );
  return (
    <AnalyticsWorkspace
      key={draftKey}
      allowed={allowed}
      measure={measure}
      panels={panels}
      filters={filters}
      initialDraft={
        savedDraft?.selection === draftKey ? savedDraft.filters : filters
      }
      onDraftChange={(values) => onDraftChange(draftKey, values)}
      scopeLabel="Per-measure server-authorized scope; department grants may limit results to your current department"
      refreshing={query.isFetching && !!query.data && !query.isError}
      {...(notice?.key === selectionKey ? { notice: notice.message } : {})}
      onMeasureChange={(next) =>
        change({
          measure: next,
          filters: {
            ...filters,
            subjectId: "",
            ...(next === "monthly"
              ? { from: defaults.from, toExclusive: defaults.toExclusive }
              : {}),
          },
          page: 1,
        })
      }
      onApply={(next, values) =>
        change({ measure: next, filters: values, page: 1 })
      }
      onPageChange={(next, value) =>
        change({ measure: next, filters, page: value })
      }
      onRetry={() => {
        if (error) return;
        setNotice(null);
        void query.refetch().then((result) => {
          if (result.isSuccess)
            setNotice({
              key: selectionKey,
              message: `${MEASURES[measure]} refreshed from authoritative data.`,
            });
        });
      }}
    />
  );
}
