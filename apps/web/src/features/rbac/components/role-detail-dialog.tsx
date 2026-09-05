"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getRole as defaultGetRole } from "../api/get-role";
import { PermissionGrantsEditor } from "./permission-grants-editor";
import type {
  AddGrant,
  AddGrantOutcome,
  DeleteRole,
  RemoveGrant,
  RemoveGrantOutcome,
  UpdateRole,
} from "../lib/rbac-outcome";
import type { GetRole } from "../api/get-role";
import type {
  Permission,
  PermissionScope,
  Role,
  RoleWithGrants,
} from "../lib/rbac-types";

const SAVE_ERRORS: Record<string, string> = {
  name_conflict: "Another role already uses that name.",
  permission_denied: "You do not have permission to update this role.",
  unexpected: "We could not save those changes. Try again.",
};

const DELETE_ERRORS: Record<string, string> = {
  is_system: "System roles cannot be deleted.",
  in_use: "This role is assigned to at least one user and cannot be deleted.",
  permission_denied: "You do not have permission to delete this role.",
  unexpected: "We could not delete this role. Try again.",
};

interface RoleDetailDialogProps {
  roleId: string | null;
  onOpenChange: (open: boolean) => void;
  permissions: readonly Permission[];
  getRole?: GetRole;
  onUpdate: UpdateRole;
  onDelete: DeleteRole;
  onAddGrant: AddGrant;
  onRemoveGrant: RemoveGrant;
  onSaved: (role: Role) => void;
  onDeleted: (id: string) => void;
}

/**
 * Thin shell that owns only the dialog's open state. `RoleDetailBody` is
 * remounted (via `key`) for each `roleId`, so it never needs to reset its own
 * load/edit/delete state by hand.
 */
export function RoleDetailDialog({
  roleId,
  onOpenChange,
  ...bodyProps
}: RoleDetailDialogProps) {
  return (
    <Dialog
      open={roleId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {roleId !== null ? (
          <RoleDetailBody
            key={roleId}
            roleId={roleId}
            onClose={() => onOpenChange(false)}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface RoleDetailBodyProps {
  roleId: string;
  onClose: () => void;
  permissions: readonly Permission[];
  getRole?: GetRole;
  onUpdate: UpdateRole;
  onDelete: DeleteRole;
  onAddGrant: AddGrant;
  onRemoveGrant: RemoveGrant;
  onSaved: (role: Role) => void;
  onDeleted: (id: string) => void;
}

function RoleDetailBody({
  roleId,
  onClose,
  permissions,
  getRole = defaultGetRole,
  onUpdate,
  onDelete,
  onAddGrant,
  onRemoveGrant,
  onSaved,
  onDeleted,
}: RoleDetailBodyProps) {
  const nameId = useId();
  const descriptionId = useId();

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [role, setRole] = useState<RoleWithGrants | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getRole(roleId).then((loaded) => {
      if (cancelled) {
        return;
      }
      if (loaded) {
        setRole(loaded);
        setName(loaded.name);
        setDescription(loaded.description ?? "");
        setStatus("loaded");
      } else {
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [roleId, getRole]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!role) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const outcome = await onUpdate(role.id, { name, description });

    setSaving(false);

    if (outcome.status === "success") {
      setRole((current) =>
        current ? { ...current, ...outcome.role } : current,
      );
      onSaved(outcome.role);
      return;
    }
    if (outcome.status === "field_errors") {
      setSaveError(outcome.fieldErrors.name ?? "That name is not valid.");
      return;
    }
    setSaveError(SAVE_ERRORS[outcome.status] ?? SAVE_ERRORS.unexpected!);
  }

  async function handleDelete() {
    if (!role) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    const outcome = await onDelete(role.id);

    setDeleting(false);

    if (outcome.status === "success") {
      onDeleted(role.id);
      onClose();
      return;
    }
    setDeleteError(DELETE_ERRORS[outcome.status] ?? DELETE_ERRORS.unexpected!);
  }

  async function handleAddGrant(
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<AddGrantOutcome> {
    if (!role) {
      return { status: "unexpected" };
    }
    const outcome = await onAddGrant(role.id, permissionKey, scope);
    if (outcome.status === "success") {
      setRole((current) =>
        current
          ? {
              ...current,
              grants: [...current.grants, { permissionKey, scope }],
            }
          : current,
      );
    }
    return outcome;
  }

  async function handleRemoveGrant(
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<RemoveGrantOutcome> {
    if (!role) {
      return { status: "unexpected" };
    }
    const outcome = await onRemoveGrant(role.id, permissionKey, scope);
    if (outcome.status === "success") {
      setRole((current) =>
        current
          ? {
              ...current,
              grants: current.grants.filter(
                (grant) =>
                  !(
                    grant.permissionKey === permissionKey &&
                    grant.scope === scope
                  ),
              ),
            }
          : current,
      );
    }
    return outcome;
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading role…
      </div>
    );
  }

  if (status === "error" || !role) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this role</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const nameChanged =
    name !== role.name || description !== (role.description ?? "");

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <DialogTitle>{role.name}</DialogTitle>
          {role.isSystem ? <Badge variant="secondary">System</Badge> : null}
        </div>
        <DialogDescription>
          View and configure this role&apos;s name, description, and permission
          grants.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        {saveError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{saveError}</AlertTitle>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={descriptionId}>Description</Label>
          <Input
            id={descriptionId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={!nameChanged || saving}
            aria-busy={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>

          {role.isSystem ? (
            <span className="text-muted-foreground text-xs">
              System roles cannot be deleted.
            </span>
          ) : confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">Delete this role?</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={deleting}
                aria-busy={deleting}
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete role
            </Button>
          )}
        </div>

        {deleteError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{deleteError}</AlertTitle>
          </Alert>
        ) : null}
      </form>

      <div className="border-border border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Permission grants</h3>
        <PermissionGrantsEditor
          permissions={permissions}
          grants={role.grants}
          onAddGrant={handleAddGrant}
          onRemoveGrant={handleRemoveGrant}
        />
      </div>
    </>
  );
}
