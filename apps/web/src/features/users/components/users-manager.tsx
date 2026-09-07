"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { assignUserRole as defaultAssignUserRole } from "../api/assign-user-role";
import { createUser as defaultCreateUser } from "../api/create-user";
import { deactivateUser as defaultDeactivateUser } from "../api/deactivate-user";
import { getUser as defaultGetUser, type GetUser } from "../api/get-user";
import { reactivateUser as defaultReactivateUser } from "../api/reactivate-user";
import { updateUser as defaultUpdateUser } from "../api/update-user";
import { CreateUserDialog } from "./create-user-dialog";
import { UserDetailDialog } from "./user-detail-dialog";
import { UserFilters } from "./user-filters";
import { UsersTable } from "./users-table";
import type {
  AssignRole,
  CreateUser,
  DeactivateUser,
  ReactivateUser,
  UpdateUser,
} from "../lib/users-outcome";
import {
  displayName,
  type PaginatedUsers,
  type User,
  type UserRoleSummary,
  type UserStatus,
} from "../lib/users-types";

const PAGE_SIZE = 10;

interface UsersManagerProps {
  initialPage: PaginatedUsers;
  roles: readonly UserRoleSummary[];
  createUser?: CreateUser;
  updateUser?: UpdateUser;
  deactivateUser?: DeactivateUser;
  reactivateUser?: ReactivateUser;
  assignUserRole?: AssignRole;
  getUser?: GetUser;
}

export function UsersManager({
  initialPage,
  roles,
  createUser = defaultCreateUser,
  updateUser = defaultUpdateUser,
  deactivateUser = defaultDeactivateUser,
  reactivateUser = defaultReactivateUser,
  assignUserRole = defaultAssignUserRole,
  getUser = defaultGetUser,
}: UsersManagerProps) {
  const [users, setUsers] = useState<User[]>([...initialPage.items]);
  const [statusFilter, setStatusFilter] = useState<UserStatus | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter && user.status !== statusFilter) {
        return false;
      }
      if (term === "") {
        return true;
      }
      return (
        user.email.toLowerCase().includes(term) ||
        displayName(user).toLowerCase().includes(term)
      );
    });
  }, [users, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function upsertUser(next: User) {
    setUsers((current) => {
      const index = current.findIndex((user) => user.id === next.id);
      if (index === -1) {
        return [next, ...current];
      }
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {users.length} user{users.length === 1 ? "" : "s"}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New user
        </Button>
      </div>

      <UserFilters
        status={statusFilter}
        search={search}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      <UsersTable
        users={visible}
        onSelect={setSelectedUserId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={statusFilter !== null || search.trim() !== ""}
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles}
        onCreate={createUser}
        onCreated={(user) => {
          upsertUser(user);
          setPage(1);
          setSearch("");
          setStatusFilter(null);
        }}
      />

      <UserDetailDialog
        userId={selectedUserId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUserId(null);
          }
        }}
        roles={roles}
        getUser={getUser}
        onUpdate={updateUser}
        onDeactivate={deactivateUser}
        onReactivate={reactivateUser}
        onAssignRole={assignUserRole}
        onChanged={upsertUser}
      />
    </div>
  );
}
