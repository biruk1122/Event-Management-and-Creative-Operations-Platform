"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  EmployeesRequestError,
  getEmployee,
  getEmployeeOptions,
  listAssignableEmployeeRoles,
  listEmployees,
} from "../api/employees-gateway";
import { employeeKeys, useEmployeesMutations } from "../api/employees-queries";
import { EmployeeDetailDialog } from "./employee-detail-dialog";
import { EmployeeFilters } from "./employee-filters";
import { EmployeesTable } from "./employees-table";
import { RegisterEmployeeDialog } from "./register-employee-dialog";
import type { EmploymentStatus, EmploymentType } from "../lib/employees-types";

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

export function EmployeesManager({ access }: { access: CurrentAccess }) {
  const keys = employeeKeys(access);
  const client = useQueryClient();
  const canCreate = access.grants.some(
    (grant) =>
      grant.permissionKey === "employee.create" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState<EmploymentType | null>(
    null,
  );
  const [employmentStatus, setEmploymentStatus] =
    useState<EmploymentStatus | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    search: debouncedSearch.trim(),
    departmentId,
    employmentType,
    employmentStatus,
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listEmployees(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const optionsQuery = useQuery({
    queryKey: keys.options,
    queryFn: ({ signal }) => getEmployeeOptions(signal),
    retry: false,
    staleTime: 60_000,
  });

  const rolesQuery = useQuery({
    queryKey: [...keys.all, "assignable-roles"],
    queryFn: ({ signal }) => listAssignableEmployeeRoles(signal),
    enabled: canCreate,
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useEmployeesMutations(access);

  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof EmployeesRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const employees = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive =
    departmentId !== null ||
    employmentType !== null ||
    employmentStatus !== null ||
    debouncedSearch.trim() !== "";

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
        <p role="status">Loading employees…</p>
      ) : listQuery.isError ? null : (
        <>
          <div
            data-admin-toolbar
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {total} employee{total === 1 ? "" : "s"}
              {filtersActive ? " match these filters" : ""}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Refresh"
                onClick={() => void listQuery.refetch()}
              >
                <RefreshCw aria-hidden="true" />
              </Button>
              {canCreate ? (
                <Button type="button" onClick={() => setRegisterOpen(true)}>
                  <Plus aria-hidden="true" data-icon="inline-start" />
                  Register Employee
                </Button>
              ) : null}
            </div>
          </div>

          <EmployeeFilters
            search={search}
            departmentId={departmentId}
            employmentType={employmentType}
            employmentStatus={employmentStatus}
            departments={optionsQuery.data?.departments ?? []}
            onSearchChange={(value) => {
              setSearch(value);
              resetToFirstPage();
            }}
            onDepartmentChange={(value) => {
              setDepartmentId(value);
              resetToFirstPage();
            }}
            onEmploymentTypeChange={(value) => {
              setEmploymentType(value);
              resetToFirstPage();
            }}
            onEmploymentStatusChange={(value) => {
              setEmploymentStatus(value);
              resetToFirstPage();
            }}
          />

          <EmployeesTable
            employees={employees}
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
        <RegisterEmployeeDialog
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          departments={optionsQuery.data?.departments ?? []}
          roles={rolesQuery.data ?? []}
          managers={employees}
          onRegister={mutations.register.mutateAsync}
          onRegistered={() => {
            setSearch("");
            setDepartmentId(null);
            setEmploymentType(null);
            setEmploymentStatus(null);
            setPage(1);
            setAnnouncement("Employee registered.");
          }}
        />
      ) : null}

      <EmployeeDetailDialog
        employeeId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        managers={employees}
        getEmployee={getEmployee}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onUpdateStatus={(id, status) =>
          mutations.updateStatus.mutateAsync({ id, status })
        }
        onChanged={() => void listQuery.refetch()}
      />
    </div>
  );
}
