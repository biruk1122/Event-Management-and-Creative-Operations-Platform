"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  DepartmentsRequestError,
  getDepartment,
  listAssignableManagers,
  listDepartments,
} from "../api/departments-gateway";
import {
  departmentKeys,
  useDepartmentsMutations,
} from "../api/departments-queries";
import { CreateDepartmentDialog } from "./create-department-dialog";
import { DepartmentDetailDialog } from "./department-detail-dialog";
import { DepartmentFilters } from "./department-filters";
import { DepartmentsTable } from "./departments-table";
import type { DepartmentActivity } from "../lib/departments-types";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function DepartmentsManager({ access }: { access: CurrentAccess }) {
  const keys = departmentKeys(access);
  const client = useQueryClient();
  const can = (permission: string) =>
    access.grants.some(
      (grant) =>
        grant.permissionKey === permission && grant.scope === "ORGANIZATION",
    );
  const canCreate = can("department.create");
  const canEdit = can("department.update");
  const canAssignManager = can("department.assign_manager");
  const canDelete = can("department.delete");

  const [statusFilter, setStatusFilter] = useState<DepartmentActivity | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    status: statusFilter,
    search: debouncedSearch.trim(),
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listDepartments(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const managersQuery = useQuery({
    queryKey: keys.managers,
    queryFn: ({ signal }) => listAssignableManagers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: canCreate || canEdit || canAssignManager,
  });

  const mutations = useDepartmentsMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof DepartmentsRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const departments = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive = statusFilter !== null || debouncedSearch.trim() !== "";
  const managers = managersQuery.data ?? [];

  function resetToFirstPage() {
    setPage(1);
  }

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
        <p role="status">Loading departments…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {total} department{total === 1 ? "" : "s"}
              {filtersActive ? " match these filters" : ""}
            </p>
            {canCreate ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New department
              </Button>
            ) : null}
          </div>

          <DepartmentFilters
            status={statusFilter}
            search={search}
            onStatusChange={(value) => {
              setStatusFilter(value);
              resetToFirstPage();
            }}
            onSearchChange={(value) => {
              setSearch(value);
              resetToFirstPage();
            }}
          />

          <DepartmentsTable
            departments={departments}
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

      {canCreate ? (
        <CreateDepartmentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          managers={managers}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setStatusFilter(null);
            setSearch("");
            setPage(1);
            setAnnouncement("Department created.");
          }}
        />
      ) : null}

      <DepartmentDetailDialog
        departmentId={selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
          }
        }}
        managers={managers}
        canEdit={canEdit}
        canAssignManager={canAssignManager}
        canDelete={canDelete}
        getDepartment={getDepartment}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onAssignManager={(id, managerId) =>
          mutations.assignManager.mutateAsync({ id, managerId })
        }
        onDeactivate={mutations.deactivate.mutateAsync}
        onReactivate={mutations.reactivate.mutateAsync}
        onDelete={mutations.remove.mutateAsync}
        onChanged={() => void listQuery.refetch()}
        onDeleted={() => {
          setSelectedId(null);
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
