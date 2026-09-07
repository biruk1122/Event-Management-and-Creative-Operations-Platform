"use client";

import { RBAC_FAILURE_MESSAGES } from "../lib/rbac-outcome";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
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
  RoleFormValues,
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
  ...RBAC_FAILURE_MESSAGES,
  name_conflict: "Another role already uses that name.",
  permission_denied: "You do not have permission to update this role.",
  unexpected: "We could not save those changes. Try again.",
};

const DELETE_ERRORS: Record<string, string> = {
  ...RBAC_FAILURE_MESSAGES,
  is_system: "System roles cannot be deleted.",
  in_use: "This role is assigned to at least one user and cannot be deleted.",
  permission_denied: "You do not have permission to delete this role.",
  unexpected: "We could not delete this role. Try again.",
};

interface RoleDetailDialogProps {
  initialDraft?: Partial<RoleFormValues> | undefined;
  onDraftChange?: (draft: Partial<RoleFormValues>) => void;
  queryScope?: readonly string[];
  canUpdate?: boolean;
  canDelete?: boolean;
  canConfigure?: boolean;
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
  initialDraft?: Partial<RoleFormValues> | undefined;
  onDraftChange?: (draft: Partial<RoleFormValues>) => void;
  queryScope?: readonly string[];
  canUpdate?: boolean;
  canDelete?: boolean;
  canConfigure?: boolean;
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

function RoleDetailBody(props: RoleDetailBodyProps) {
  const { roleId, queryScope = ["rbac"], getRole = defaultGetRole } = props;
  const query = useQuery({
    queryKey: [...queryScope, "role", roleId],
    queryFn: () => getRole(roleId),
    retry: false,
    staleTime: 0,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });
  if (query.isPending)
    return (
      <>
        <DialogTitle>Role details</DialogTitle>
        <DialogDescription>Loading this role.</DialogDescription>
        <p role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading role…
        </p>
      </>
    );
  return (
    <>
      {query.isError || !query.data ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>We could not load this role</AlertTitle>
          <AlertDescription>
            {query.error?.message ?? "This role no longer exists."}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {query.data ? (
        <RoleEditor
          {...props}
          role={query.data}
          canUpdate={!query.isError && (props.canUpdate ?? true)}
          canDelete={!query.isError && (props.canDelete ?? true)}
          canConfigure={!query.isError && (props.canConfigure ?? true)}
        />
      ) : (
        <>
          <DialogTitle>Role details unavailable</DialogTitle>
          <DialogDescription>Retry or close this dialog.</DialogDescription>
        </>
      )}
    </>
  );
}

function RoleEditor({
  role,
  initialDraft,
  onDraftChange,
  onClose,
  permissions,
  onUpdate,
  onDelete,
  onAddGrant,
  onRemoveGrant,
  onSaved,
  onDeleted,
  canUpdate = true,
  canDelete = true,
  canConfigure = true,
}: RoleDetailBodyProps & { role: RoleWithGrants }) {
  const nameId = useId();
  const descriptionId = useId();

  const [draft, setDraft] = useState<Partial<RoleFormValues>>(
    initialDraft ?? {},
  );
  const name = draft.name ?? role.name;
  const description = draft.description ?? role.description ?? "";
  function changeDraft(next: Partial<RoleFormValues>) {
    setDraft(next);
    onDraftChange?.(next);
  }
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const hasToggledDeleteControls = useRef(false);

  // The confirm/cancel controls replace the Delete button in the DOM (rather
  // than just changing its label), which would otherwise drop keyboard focus
  // back to the document body on every transition.
  useEffect(() => {
    if (!hasToggledDeleteControls.current) {
      hasToggledDeleteControls.current = true;
      return;
    }
    if (confirmingDelete) {
      confirmDeleteButtonRef.current?.focus();
    } else {
      deleteButtonRef.current?.focus();
    }
  }, [confirmingDelete]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const outcome = await onUpdate(role.id, { name, description });

    setSaving(false);

    if (outcome.status === "success") {
      changeDraft({});
      onSaved(outcome.role);
      return;
    }
    if (outcome.status === "field_errors") {
      setSaveError(
        outcome.fieldErrors.name ??
          outcome.fieldErrors.description ??
          "Check the role details.",
      );
      return;
    }
    setSaveError(SAVE_ERRORS[outcome.status] ?? SAVE_ERRORS.unexpected!);
  }

  async function handleDelete() {
    if (!canDelete || deleting) {
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

  function handleAddGrant(
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<AddGrantOutcome> {
    return onAddGrant(role.id, permissionKey, scope);
  }

  function handleRemoveGrant(
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<RemoveGrantOutcome> {
    return onRemoveGrant(role.id, permissionKey, scope);
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
            readOnly={!canUpdate || saving}
            value={name}
            onChange={(event) =>
              changeDraft({ ...draft, name: event.target.value })
            }
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={descriptionId}>Description</Label>
          <Input
            id={descriptionId}
            readOnly={!canUpdate || saving}
            value={description}
            onChange={(event) =>
              changeDraft({ ...draft, description: event.target.value })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={!canUpdate || !nameChanged || saving}
            aria-busy={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>

          {!canDelete ? null : role.isSystem ? (
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
                ref={confirmDeleteButtonRef}
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={deleting}
                aria-busy={deleting}
              >
                {deleting ? "Deleting..." : "Confirm delete"}
              </Button>
            </div>
          ) : (
            <Button
              ref={deleteButtonRef}
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
          readOnly={!canConfigure}
          permissions={permissions}
          grants={role.grants}
          onAddGrant={handleAddGrant}
          onRemoveGrant={handleRemoveGrant}
        />
      </div>
    </>
  );
}
