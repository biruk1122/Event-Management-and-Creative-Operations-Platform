"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import { listPartners, PartnersRequestError } from "../api/partners-gateway";
import { partnerKeys, usePartnersMutations } from "../api/partners-queries";
import { partnerAbilities } from "../lib/partner-access";
import type { PartnerStatus } from "../lib/partners-types";
import { CreatePartnerDialog } from "./create-partner-dialog";
import { PartnerDetailDialog } from "./partner-detail-dialog";
import { PartnersFilters } from "./partners-filters";
import { PartnersTable } from "./partners-table";

const PAGE_SIZE = 10;

export function PartnersManager({ access }: { access: CurrentAccess }) {
  const keys = partnerKeys(access);
  const client = useQueryClient();
  const abilities = partnerAbilities(access);

  const [statusFilter, setStatusFilter] = useState<PartnerStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const listParams = {
    status: statusFilter,
    search: search.trim() || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listPartners(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const mutations = usePartnersMutations(access);

  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof PartnersRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = data?.items ?? [];
  const filtersActive = statusFilter !== null || search.trim() !== "";

  return (
    <div className="space-y-4">
      {listQuery.isError ? (
        <div role="alert" className="space-y-2">
          <p>{(listQuery.error as Error).message}</p>
          <Button variant="outline" onClick={() => void listQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {listQuery.isPending ? (
        <p role="status">Loading partners…</p>
      ) : listQuery.isError ? null : (
        <>
          <div
            data-work-toolbar
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching partner${total === 1 ? "" : "s"}`
                : `${total} partner${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New partner
              </Button>
            ) : null}
          </div>

          <PartnersFilters
            status={statusFilter}
            onStatusChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />

          <PartnersTable
            partners={rows}
            onSelect={setSelectedId}
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            filtered={filtersActive}
          />
        </>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {abilities.canCreate ? (
        <CreatePartnerDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setStatusFilter(null);
            setSearch("");
            setPage(1);
            setAnnouncement("Partner registered.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <PartnerDetailDialog
        partnerId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        canUpdate={abilities.canUpdate}
        canAddActivity={abilities.canAddActivity}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onAddActivity={(id, note) =>
          mutations.addActivity.mutateAsync({ id, note })
        }
        onChanged={() => void listQuery.refetch()}
      />
    </div>
  );
}
