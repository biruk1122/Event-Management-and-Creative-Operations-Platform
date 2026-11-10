"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listDepartments } from "@/features/departments/api/departments-gateway";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  listAssignableRoles,
  listUsers,
  UsersRequestError,
} from "../api/users-gateway";
import { userKeys, useUsersMutations } from "../api/users-queries";
import { CreateUserDialog } from "./create-user-dialog";
import { UserFilters } from "./user-filters";
import { UserSummaryCards, type UserSummary } from "./user-summary-cards";
import { UsersTable } from "./users-table";
import { displayName, type User, type UserStatus } from "../lib/users-types";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

/** The authoritative total of users with one status (or all when null). */
function useStatusCount(base: readonly unknown[], status: UserStatus | null) {
  return useQuery({
    queryKey: [...base, "summary", status ?? "ALL"],
    queryFn: ({ signal }) =>
      listUsers({ status, search: "", page: 1, pageSize: 1 }, signal).then(
        (result) => result.total,
      ),
    retry: false,
    staleTime: 30_000,
  });
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const STATUS_ERRORS: Record<string, string> = {
  already_inactive: "This user is already deactivated.",
  already_active: "This user is already active.",
  not_found: "This user no longer exists. Refresh the list.",
  permission_denied: "You do not have permission to change this account.",
  unexpected: "We could not change that account. Try again.",
};

export function UsersManager({ access }: { access: CurrentAccess }) {
  const keys = userKeys(access);
  const client = useQueryClient();
  const router = useRouter();
  const can = (permission: string) =>
    access.grants.some(
      (grant) =>
        grant.permissionKey === permission && grant.scope === "ORGANIZATION",
    );

  const [statusFilter, setStatusFilter] = useState<UserStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pendingStatus, setPendingStatus] = useState<{
    user: User;
    next: "deactivate" | "reactivate";
  } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

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

  // Headline counts come from the list API's own totals, one cheap request
  // per status, so they always match what the table can show.
  const totalCount = useStatusCount(keys.all, null);
  const activeCount = useStatusCount(keys.all, "ACTIVE");
  const inactiveCount = useStatusCount(keys.all, "INACTIVE");

  const rolesQuery = useQuery({
    queryKey: keys.roles,
    queryFn: ({ signal }) => listAssignableRoles(signal),
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useUsersMutations(access);

  const departmentsQuery = useQuery({
    queryKey: [...keys.all, "assignable-departments"],
    queryFn: ({ signal }) =>
      listDepartments({ status: "ACTIVE", page: 1, pageSize: 100 }, signal),
    enabled: can("user.assign_department"),
    retry: false,
  });

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
  const filtersActive = statusFilter !== null || search.trim() !== "";

  const summary: UserSummary = {
    total: totalCount.data ?? null,
    active: activeCount.data ?? null,
    inactive: inactiveCount.data ?? null,
  };

  function resetToFirstPage() {
    setPage(1);
  }

  function clearFilters() {
    setStatusFilter(null);
    setSearch("");
    setPage(1);
  }

  function openDetails(user: User, edit: boolean) {
    router.push(`/users/${user.id}${edit ? "?edit=1" : ""}` as Route);
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    const { user, next } = pendingStatus;
    setStatusBusy(true);
    setStatusError(null);
    const outcome =
      next === "deactivate"
        ? await mutations.deactivate.mutateAsync(user.id)
        : await mutations.reactivate.mutateAsync(user.id);
    setStatusBusy(false);
    if (outcome.status === "success") {
      setPendingStatus(null);
      setAnnouncement(
        next === "deactivate"
          ? `${displayName(user)} was deactivated.`
          : `${displayName(user)} was activated.`,
      );
      void listQuery.refetch();
      return;
    }
    setStatusError(STATUS_ERRORS[outcome.status] ?? STATUS_ERRORS.unexpected!);
  }

  return (
    <div className="space-y-5">
      {listQuery.isError ? (
        <div role="alert" className="space-y-2">
          <p>{(listQuery.error as Error).message}</p>
          <Button variant="outline" onClick={() => void listQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      <UserSummaryCards summary={summary} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {listQuery.isPending || listQuery.isError
            ? null
            : `${total} user${total === 1 ? "" : "s"}${filtersActive ? " match these filters" : ""}`}
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
        active={filtersActive}
        onClear={clearFilters}
        onStatusChange={(value) => {
          setStatusFilter(value);
          resetToFirstPage();
        }}
        onSearchChange={(value) => {
          setSearch(value);
          resetToFirstPage();
        }}
      />

      {listQuery.isPending ? (
        <p role="status">Loading users…</p>
      ) : listQuery.isError ? null : (
        <UsersTable
          users={users}
          total={total}
          pageSize={PAGE_SIZE}
          page={currentPage}
          pageCount={pageCount}
          onPageChange={setPage}
          filtered={filtersActive}
          permissions={{
            canEdit: can("user.update"),
            canDeactivate: can("user.deactivate"),
            canActivate: can("user.manage_status"),
          }}
          onEdit={(user) => openDetails(user, true)}
          onRequestStatusChange={(user) => {
            setStatusError(null);
            setPendingStatus({
              user,
              next: user.status === "ACTIVE" ? "deactivate" : "reactivate",
            });
          }}
        />
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {can("user.create") ? (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          roles={rolesQuery.data ?? []}
          departments={departmentsQuery.data?.items ?? []}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            clearFilters();
            setAnnouncement("User created.");
          }}
        />
      ) : null}

      <Dialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setPendingStatus(null);
        }}
      >
        {pendingStatus ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pendingStatus.next === "deactivate"
                  ? `Deactivate ${displayName(pendingStatus.user)}?`
                  : `Activate ${displayName(pendingStatus.user)}?`}
              </DialogTitle>
              <DialogDescription>
                {pendingStatus.next === "deactivate"
                  ? "They will be signed out and cannot sign in until the account is activated again."
                  : "They will be able to sign in again with their existing details."}
              </DialogDescription>
            </DialogHeader>
            {statusError ? (
              <Alert variant="destructive" aria-live="assertive">
                <AlertTitle>{statusError}</AlertTitle>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={statusBusy}
                onClick={() => setPendingStatus(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={
                  pendingStatus.next === "deactivate"
                    ? "destructive"
                    : "default"
                }
                disabled={statusBusy}
                aria-busy={statusBusy}
                onClick={() => void confirmStatusChange()}
              >
                {statusBusy
                  ? pendingStatus.next === "deactivate"
                    ? "Deactivating…"
                    : "Activating…"
                  : pendingStatus.next === "deactivate"
                    ? "Deactivate"
                    : "Activate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
