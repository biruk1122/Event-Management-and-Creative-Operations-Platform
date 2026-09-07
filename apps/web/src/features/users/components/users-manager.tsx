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
  getUser,
  listAssignableRoles,
  listUsers,
  UsersRequestError,
} from "../api/users-gateway";
import { userKeys, useUsersMutations } from "../api/users-queries";
import { CreateUserDialog } from "./create-user-dialog";
import { UserDetailDialog } from "./user-detail-dialog";
import { UserFilters } from "./user-filters";
import { UsersTable } from "./users-table";
import type { UserStatus } from "../lib/users-types";

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

export function UsersManager({ access }: { access: CurrentAccess }) {
  const keys = userKeys(access);
  const client = useQueryClient();
  const can = (permission: string) =>
    access.grants.some(
      (grant) =>
        grant.permissionKey === permission && grant.scope === "ORGANIZATION",
    );

  const [statusFilter, setStatusFilter] = useState<UserStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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
    queryFn: ({ signal }) => listUsers(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const rolesQuery = useQuery({
    queryKey: keys.roles,
    queryFn: ({ signal }) => listAssignableRoles(signal),
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useUsersMutations(access);

  // A 401/403 on the list means the caller's authority changed under them;
  // re-check access so the screen can drop to its denied/expired state.
  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof UsersRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive = statusFilter !== null || debouncedSearch.trim() !== "";

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
        <p role="status">Loading users…</p>
      ) : listQuery.isError ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {total} user{total === 1 ? "" : "s"}
              {filtersActive ? " match these filters" : ""}
            </p>
            {can("user.create") ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New user
              </Button>
            ) : null}
          </div>

          <UserFilters
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

          <UsersTable
            users={users}
            onSelect={setSelectedUserId}
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

      {can("user.create") ? (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          roles={rolesQuery.data ?? []}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setStatusFilter(null);
            setSearch("");
            setPage(1);
            setAnnouncement("User created.");
          }}
        />
      ) : null}

      <UserDetailDialog
        userId={selectedUserId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserId(null);
          }
        }}
        roles={rolesQuery.data ?? []}
        getUser={getUser}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onDeactivate={mutations.deactivate.mutateAsync}
        onReactivate={mutations.reactivate.mutateAsync}
        onAssignRole={(id, roleId) =>
          mutations.assignRole.mutateAsync({ id, roleId })
        }
        onChanged={() => void listQuery.refetch()}
      />
    </div>
  );
}
