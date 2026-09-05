"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { addGrant as defaultAddGrant } from "../api/add-grant";
import { createRole as defaultCreateRole } from "../api/create-role";
import { deleteRole as defaultDeleteRole } from "../api/delete-role";
import { getRole as defaultGetRole, type GetRole } from "../api/get-role";
import { removeGrant as defaultRemoveGrant } from "../api/remove-grant";
import { updateRole as defaultUpdateRole } from "../api/update-role";
import { CreateRoleDialog } from "./create-role-dialog";
import { RoleDetailDialog } from "./role-detail-dialog";
import { RolesTable } from "./roles-table";
import type {
  AddGrant,
  CreateRole,
  DeleteRole,
  RemoveGrant,
  UpdateRole,
} from "../lib/rbac-outcome";
import type { Permission, Role } from "../lib/rbac-types";

interface RolesManagerProps {
  initialRoles: readonly Role[];
  permissions: readonly Permission[];
  createRole?: CreateRole;
  updateRole?: UpdateRole;
  deleteRole?: DeleteRole;
  getRole?: GetRole;
  addGrant?: AddGrant;
  removeGrant?: RemoveGrant;
}

export function RolesManager({
  initialRoles,
  permissions,
  createRole = defaultCreateRole,
  updateRole = defaultUpdateRole,
  deleteRole = defaultDeleteRole,
  getRole = defaultGetRole,
  addGrant = defaultAddGrant,
  removeGrant = defaultRemoveGrant,
}: RolesManagerProps) {
  const [roles, setRoles] = useState<Role[]>([...initialRoles]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {roles.length} role{roles.length === 1 ? "" : "s"}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New role
        </Button>
      </div>

      <RolesTable roles={roles} onSelect={setSelectedRoleId} />

      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createRole}
        onCreated={(role) => setRoles((current) => [...current, role])}
      />

      <RoleDetailDialog
        roleId={selectedRoleId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRoleId(null);
          }
        }}
        permissions={permissions}
        getRole={getRole}
        onUpdate={updateRole}
        onDelete={deleteRole}
        onAddGrant={addGrant}
        onRemoveGrant={removeGrant}
        onSaved={(role) =>
          setRoles((current) =>
            current.map((existing) =>
              existing.id === role.id ? role : existing,
            ),
          )
        }
        onDeleted={(id) =>
          setRoles((current) => current.filter((role) => role.id !== id))
        }
      />
    </div>
  );
}
