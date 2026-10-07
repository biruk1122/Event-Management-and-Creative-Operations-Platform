"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  accessKey,
  useCurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  fetchDashboard,
  DashboardRequestError,
} from "../api/dashboard-gateway";
import {
  canEnter,
  employeeCards,
  managementCards,
  type DashboardAccess,
  type DashboardPanel,
} from "../lib/dashboard-presentation";
import {
  dashboardQuery,
  dashboardUrl,
  defaultDashboardFilters,
  readDashboardSelection,
  type DashboardFilters,
} from "../lib/dashboard-selection";
import { DashboardWorkspace } from "./dashboard-workspace";
type SavedDraft = {
  owner: string;
  selection: string;
  filters: DashboardFilters;
};

export function dashboardIdentity(access: DashboardAccess, epoch: number) {
  return [
    "dashboards",
    access.userId,
    access.grants
      .map((grant) => `${grant.permissionKey}:${grant.scope}`)
      .sort()
      .join(","),
    epoch,
  ] as const;
}
export function DashboardScreen() {
  const access = useCurrentAccess(),
    client = useQueryClient();
  const [draft, setDraft] = useState<SavedDraft | null>(null);
  const [blocked, setBlocked] = useState<{
    epoch: number;
    error: DashboardRequestError;
  } | null>(null);
  const failClosed = useCallback(
    (error: DashboardRequestError) =>
      setBlocked({ epoch: access.dataUpdatedAt, error }),
    [access.dataUpdatedAt],
  );
  const denied = blocked?.epoch === access.dataUpdatedAt ? blocked.error : null;
  const hidden =
    access.isFetching ||
    access.isPaused ||
    access.isError ||
    !access.data ||
    !!denied;
  useEffect(() => {
    const stale = {
      queryKey: ["dashboards"],
      ...(hidden
        ? {}
        : {
            predicate: (query: { queryKey: readonly unknown[] }) =>
              query.queryKey[1] !== access.data?.userId ||
              query.queryKey[3] !== access.dataUpdatedAt,
          }),
    };
    void client.cancelQueries(stale);
    client.removeQueries(stale);
  }, [hidden, client, access.data?.userId, access.dataUpdatedAt]);
  // Existing mutations remain the only write paths. A successful write may alter
  // assignments/membership as well as counts, so recheck access before refetching.
  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success")
          void client.invalidateQueries({ queryKey: accessKey });
      }),
    [client],
  );
  if (access.isFetching || access.isPending || access.isPaused)
    return (
      <DashboardWorkspace
        access={null}
        audience="employee"
        accessStatus="checking"
      />
    );
  if (access.isError)
    return (
      <DashboardWorkspace
        access={null}
        audience="employee"
        accessStatus="error"
        onCheckAccess={() => void access.refetch()}
      />
    );
  if (!access.data || denied?.status === 401)
    return (
      <DashboardWorkspace
        access={null}
        audience="employee"
        accessStatus="signedOut"
      />
    );
  if (denied)
    return (
      <div role="alert" className="space-y-3">
        <p>{denied.message}</p>
        <Button onClick={() => void access.refetch()}>
          Check access again
        </Button>
      </div>
    );
  if (
    !canEnter(access.data, "management") &&
    !canEnter(access.data, "employee")
  )
    return <p role="alert">You do not have access to dashboards.</p>;
  return (
    <DashboardManager
      key={`${access.data.userId}:${access.dataUpdatedAt}`}
      access={access.data}
      epoch={access.dataUpdatedAt}
      onAuthorizationError={failClosed}
      savedDraft={draft}
      onDraftChange={setDraft}
    />
  );
}
function DashboardManager({
  access,
  epoch,
  onAuthorizationError,
  savedDraft,
  onDraftChange,
}: {
  access: DashboardAccess;
  epoch: number;
  onAuthorizationError: (error: DashboardRequestError) => void;
  savedDraft: SavedDraft | null;
  onDraftChange: (draft: SavedDraft) => void;
}) {
  const params = useSearchParams(),
    router = useRouter();
  const [defaults] = useState(defaultDashboardFilters);
  const [notice, setNotice] = useState("");
  const selection = readDashboardSelection(
    params,
    canEnter(access, "management") ? "management" : "employee",
    defaults,
  );
  const { audience, filters, error } = selection;
  const owner = JSON.stringify(dashboardIdentity(access, 0));
  const draftKey = `${audience}:${JSON.stringify(filters)}`;
  const saveDraft = useCallback(
    (filters: DashboardFilters) =>
      onDraftChange({ owner, selection: draftKey, filters }),
    [owner, draftKey, onDraftChange],
  );
  const allowed = canEnter(access, audience);
  const query = useQuery({
    queryKey: [
      ...dashboardIdentity(access, epoch),
      audience,
      dashboardQuery(selection),
    ],
    queryFn: ({ signal }) => fetchDashboard(selection, signal),
    enabled: allowed && !error,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const authorizationError =
    query.error instanceof DashboardRequestError &&
    [401, 403].includes(query.error.status)
      ? query.error
      : null;
  useEffect(() => {
    if (authorizationError) onAuthorizationError(authorizationError);
  }, [authorizationError, onAuthorizationError]);
  if (authorizationError)
    return <p role="alert">{authorizationError.message}</p>;
  if (!allowed || error)
    return (
      <div role="alert" className="space-y-3">
        <p>
          {error ?? "You do not have access to the requested dashboard view."}
        </p>
        <Link href="/dashboard" className="underline">
          Reset dashboard filters and view
        </Link>
      </div>
    );
  const catalogue = audience === "management" ? managementCards : employeeCards;
  const transient =
    !(query.error instanceof DashboardRequestError) ||
    query.error.status >= 500;
  const data = query.isError && !transient ? undefined : query.data;
  const panels: Record<string, DashboardPanel> = Object.fromEntries(
    catalogue.map((card) => [
      card.key,
      data?.cards[card.key] ??
        (query.isPending
          ? { state: "loading" }
          : { state: "unavailable", retryable: !query.isError || transient }),
    ]),
  );
  const refresh = () => {
    setNotice("");
    void query.refetch().then((result) => {
      if (result.isSuccess)
        setNotice(
          result.data.partial
            ? "Dashboard refreshed with partial source failures."
            : "Dashboard refreshed from authoritative data.",
        );
    });
  };
  return (
    <div className="space-y-4">
      {query.isError ? (
        <div role="alert">
          <p>
            {query.error instanceof DashboardRequestError
              ? query.error.message
              : "The dashboard service could not be reached. Try again."}
          </p>
          {query.error instanceof DashboardRequestError &&
          query.error.requestId ? (
            <p className="text-sm break-all">
              Support reference: {query.error.requestId}
            </p>
          ) : null}
        </div>
      ) : null}
      <DashboardWorkspace
        key={dashboardUrl(selection)}
        access={access}
        audience={audience}
        panels={panels}
        day={data?.day ?? filters.day}
        filters={filters}
        {...(savedDraft?.owner === owner && savedDraft.selection === draftKey
          ? { initialDraft: savedDraft.filters }
          : {})}
        onDraftChange={saveDraft}
        staleKeys={
          data && (query.isFetching || query.isError)
            ? Object.keys(data.cards)
            : []
        }
        refreshing={query.isFetching}
        notice={notice}
        onApply={(next) => {
          setNotice("");
          router.push(dashboardUrl({ audience, filters: next }), {
            scroll: false,
          });
        }}
        onAudienceChange={(next) => {
          setNotice("");
          router.push(
            dashboardUrl({
              audience: next,
              filters: defaultDashboardFilters(),
            }),
            { scroll: false },
          );
        }}
        onRefresh={refresh}
        onRetry={refresh}
      />
    </div>
  );
}
