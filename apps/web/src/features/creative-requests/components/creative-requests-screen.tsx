"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { formatInZone } from "@/lib/app-timezone";

import {
  getCreativeRequest,
  listCreativeRequests,
} from "../api/creative-requests-gateway";
import {
  CREATIVE_ASSET_TYPE_LABELS,
  CREATIVE_REQUEST_STATUS_LABELS,
  CREATIVE_REQUEST_STATUSES,
  creativeRequestAccess,
  type CreativeRequest,
  type CreativeRequestDirection,
  type CreativeRequestStatus,
} from "../lib/creative-requests-types";
import { CreateCreativeRequestDialog } from "./create-creative-request-dialog";
import { CreativeRequestDetail } from "./creative-request-detail";

const ALL = "all";
const PAGE_SIZE = 25;

/**
 * Creative requests (EVE-232). Promotion sends and reviews them; Production
 * receives and answers them. The same screen serves both, inside the
 * Promotion workspace and on its own page.
 */
export function CreativeRequestsScreen({
  readOnly = false,
}: {
  /** Oversight: no New request button or direction filter, whatever the
   * viewer's grants. Sent and received are relative to the viewer's own
   * department, which is not the one being overseen. */
  readOnly?: boolean;
} = {}) {
  const access = useCurrentAccess();
  if (access.isPending) return <p role="status">Checking permissions…</p>;
  if (access.isError || !access.data) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {access.isError
            ? access.error.message
            : "Your session expired. Sign in again."}
        </p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!creativeRequestAccess(access.data).canRead) {
    return <p role="alert">You do not have access to creative requests.</p>;
  }
  return <CreativeRequestsManager access={access.data} readOnly={readOnly} />;
}

function CreativeRequestsManager({
  access,
  readOnly,
}: {
  access: CurrentAccess;
  readOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const [direction, setDirection] = useState<CreativeRequestDirection | null>(
    null,
  );
  const [status, setStatus] = useState<CreativeRequestStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const selectedId = params.get("request");
  const baseKey = ["creative-requests", access.userId] as const;
  const listParams = { direction, status, search, page, pageSize: PAGE_SIZE };

  const list = useQuery({
    queryKey: [...baseKey, "list", listParams],
    queryFn: ({ signal }) => listCreativeRequests(listParams, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const selected = useQuery({
    queryKey: [...baseKey, "detail", selectedId],
    queryFn: ({ signal }) => getCreativeRequest(selectedId!, signal),
    enabled: Boolean(selectedId),
    retry: false,
  });

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("request", id);
    else next.delete("request");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, {
      scroll: false,
    });
  }

  function changed(request: CreativeRequest) {
    client.setQueryData([...baseKey, "detail", request.id], request);
    void client.invalidateQueries({ queryKey: [...baseKey, "list"] });
  }

  const canCreate = !readOnly && creativeRequestAccess(access).canCreate;
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section aria-label="Creative requests" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-1">
          <label
            htmlFor="creative-request-search"
            className="text-sm font-medium"
          >
            Search
          </label>
          <Input
            id="creative-request-search"
            type="search"
            value={search}
            placeholder="Search by title"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {readOnly ? null : (
          <Select
            value={direction ?? ALL}
            onValueChange={(value) => {
              setDirection(
                value === ALL ? null : (value as CreativeRequestDirection),
              );
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Direction" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Sent and received</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select
          value={status ?? ALL}
          onValueChange={(value) => {
            setStatus(value === ALL ? null : (value as CreativeRequestStatus));
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {CREATIVE_REQUEST_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {CREATIVE_REQUEST_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreate ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New request
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-2">
          {list.isPending ? (
            <p role="status" className="text-muted-foreground text-sm">
              Loading creative requests…
            </p>
          ) : list.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{list.error.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void list.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : data!.items.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
              No creative requests match.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border" aria-label="Requests">
              {data!.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === selectedId ? "true" : undefined}
                    className="hover:bg-muted/50 aria-[current=true]:bg-muted focus-visible:ring-ring/50 w-full px-3 py-2 text-left focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => select(item.id)}
                  >
                    <span className="block text-sm font-medium break-words">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {CREATIVE_REQUEST_STATUS_LABELS[item.status]} ·{" "}
                      {CREATIVE_ASSET_TYPE_LABELS[item.assetType]} ·{" "}
                      {item.requestingDepartment.name} to{" "}
                      {item.targetDepartment.name}
                      {item.dueAt
                        ? ` · needed by ${formatInZone(item.dueAt, { dateStyle: "medium" })}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && pages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          {!selectedId ? (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
              Choose a request to see its details.
            </p>
          ) : selected.isPending ? (
            <p role="status" className="text-muted-foreground text-sm">
              Loading request…
            </p>
          ) : selected.isError ? (
            <p role="alert" className="text-sm">
              {selected.error.message}
            </p>
          ) : (
            <CreativeRequestDetail
              key={selected.data.id}
              request={selected.data}
              queryKey={baseKey}
              onChanged={changed}
            />
          )}
        </div>
      </div>

      {canCreate ? (
        <CreateCreativeRequestDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(request) => {
            changed(request);
            select(request.id);
          }}
        />
      ) : null}
    </section>
  );
}
