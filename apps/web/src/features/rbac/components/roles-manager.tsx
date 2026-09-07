"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  accessKey,
  canManageRoles,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  RbacRequestError,
  listPermissions,
  listRoles,
} from "../api/rbac-gateway";
import { rbacKeys, useRbacMutations } from "../api/rbac-queries";
import { CreateRoleDialog } from "./create-role-dialog";
import { RoleDetailDialog } from "./role-detail-dialog";
import type { RbacDrafts } from "../lib/rbac-outcome";
import { RolesTable } from "./roles-table";

const PAGE_SIZE = 10;

export function RolesManager({
  access,
  accessUnavailable = false,
  drafts,
  onDraftsChange,
}: {
  access: CurrentAccess;
  accessUnavailable?: boolean;
  drafts?: RbacDrafts;
  onDraftsChange?: (update: (current: RbacDrafts) => RbacDrafts) => void;
}) {
  const keys = rbacKeys(access);
  const can = (permission: string) =>
    !accessUnavailable && canManageRoles(access, permission);
  const rolesQuery = useQuery({
    queryKey: keys.roles,
    queryFn: ({ signal }) => listRoles(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const permissionsQuery = useQuery({
    queryKey: keys.permissions,
    queryFn: ({ signal }) => listPermissions(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const mutations = useRbacMutations(access);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    drafts?.selectedRoleId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(drafts?.createOpen ?? false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const roles = rolesQuery.data ?? [];
  const filtered = roles.filter((role) =>
    `${role.name} ${role.description ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const error = rolesQuery.error ?? permissionsQuery.error;
  const client = useQueryClient();
  useEffect(() => {
    if (
      error instanceof RbacRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [error, client]);
  function selectRole(id: string | null) {
    setSelectedRoleId(id);
    onDraftsChange?.((current) => ({ ...current, selectedRoleId: id }));
  }
  function openCreate(open: boolean) {
    setCreateOpen(open);
    onDraftsChange?.((current) => ({ ...current, createOpen: open }));
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="space-y-2">
          <p>{error.message}</p>
          <Button
            variant="outline"
            onClick={() => {
              void rolesQuery.refetch();
              void permissionsQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {rolesQuery.isPending || permissionsQuery.isPending ? (
        <p role="status">Loading roles and permissions...</p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {roles.length} role{roles.length === 1 ? "" : "s"}
        </p>
        {can("role.create") ? (
          <Button onClick={() => openCreate(true)}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            New role
          </Button>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="role-search">Search roles</Label>
        <Input
          id="role-search"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {!rolesQuery.isPending && !rolesQuery.isError ? (
        <>
          {filtered.length === 0 && search ? (
            <p>No roles match your search.</p>
          ) : (
            <RolesTable
              roles={filtered.slice(
                (currentPage - 1) * PAGE_SIZE,
                currentPage * PAGE_SIZE,
              )}
              onSelect={selectRole}
            />
          )}
          {pages > 1 ? (
            <nav
              aria-label="Roles pagination"
              className="flex items-center gap-3"
            >
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span>
                Page {currentPage} of {pages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <CreateRoleDialog
        open={createOpen}
        onOpenChange={openCreate}
        canCreate={can("role.create")}
        initialDraft={drafts?.create}
        onDraftChange={(create) =>
          onDraftsChange?.((current) => ({ ...current, create }))
        }
        onCreate={mutations.create.mutateAsync}
        onCreated={() => {
          setPage(1);
          setSearch("");
          setAnnouncement("Role created.");
        }}
      />
      <RoleDetailDialog
        roleId={selectedRoleId}
        queryScope={keys.all}
        initialDraft={drafts?.roles[selectedRoleId ?? ""]}
        onDraftChange={(draft) =>
          onDraftsChange?.((current) => ({
            ...current,
            roles: { ...current.roles, [selectedRoleId ?? ""]: draft },
          }))
        }
        onOpenChange={(open) => {
          if (!open) selectRole(null);
        }}
        permissions={
          permissionsQuery.isError ? [] : (permissionsQuery.data ?? [])
        }
        canUpdate={can("role.update")}
        canDelete={can("role.delete")}
        canConfigure={
          can("role.configure_permissions") && !permissionsQuery.isError
        }
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onDelete={mutations.remove.mutateAsync}
        onAddGrant={(id, key, scope) =>
          mutations.add.mutateAsync({ id, key, scope })
        }
        onRemoveGrant={(id, key, scope) =>
          mutations.revoke.mutateAsync({ id, key, scope })
        }
        onSaved={() => setAnnouncement("Role saved.")}
        onDeleted={() => setAnnouncement("Role deleted.")}
      />
    </div>
  );
}
