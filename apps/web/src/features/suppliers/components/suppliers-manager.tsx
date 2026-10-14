"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import { listSuppliers, SuppliersRequestError } from "../api/suppliers-gateway";
import { supplierKeys, useSuppliersMutations } from "../api/suppliers-queries";
import { supplierAbilities } from "../lib/supplier-access";
import type { SupplierStatus } from "../lib/suppliers-types";
import { CreateSupplierDialog } from "./create-supplier-dialog";
import { SupplierDetailDialog } from "./supplier-detail-dialog";
import { SuppliersFilters } from "./suppliers-filters";
import { SuppliersTable } from "./suppliers-table";

const PAGE_SIZE = 10;

export function SuppliersManager({ access }: { access: CurrentAccess }) {
  const keys = supplierKeys(access);
  const client = useQueryClient();
  const abilities = supplierAbilities(access);

  const [statusFilter, setStatusFilter] = useState<SupplierStatus | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const listParams = {
    status: statusFilter,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listSuppliers(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const mutations = useSuppliersMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof SuppliersRequestError &&
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
  const filtersActive = statusFilter !== null;

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
        <p role="status">Loading suppliers…</p>
      ) : listQuery.isError ? null : (
        <>
          <div
            data-work-toolbar
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {filtersActive
                ? `${total} matching supplier${total === 1 ? "" : "s"}`
                : `${total} supplier${total === 1 ? "" : "s"}`}
            </p>
            {abilities.canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New supplier
              </Button>
            ) : null}
          </div>

          <SuppliersFilters
            status={statusFilter}
            onStatusChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          />

          <SuppliersTable
            suppliers={rows}
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
        <CreateSupplierDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setStatusFilter(null);
            setPage(1);
            setAnnouncement("Supplier registered.");
            void listQuery.refetch();
          }}
        />
      ) : null}

      <SupplierDetailDialog
        supplierId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        canUpdate={abilities.canUpdate}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onChanged={() => void listQuery.refetch()}
      />
    </div>
  );
}
