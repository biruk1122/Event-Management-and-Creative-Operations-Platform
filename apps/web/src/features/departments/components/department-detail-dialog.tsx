"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getDepartment as defaultGetDepartment } from "../api/departments-gateway";
import type {
  AssignManager,
  DeactivateDepartment,
  DeleteDepartment,
  DepartmentProfileValues,
  GetDepartment,
  ReactivateDepartment,
  UpdateDepartment,
} from "../lib/departments-outcome";
import {
  activityOf,
  DEPARTMENT_ACTIVITY_LABELS,
  personName,
  type AssignableUser,
  type Department,
} from "../lib/departments-types";

const NO_MANAGER = "NONE";

const ACTION_ERRORS: Record<string, string> = {
  name_conflict: "Another department already uses that name.",
  manager_not_found: "That user no longer exists.",
  already_inactive: "This department is already deactivated.",
  already_active: "This department is already active.",
  in_use: "This department still has employees and cannot be removed.",
  not_found:
    "This department no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface DepartmentDetailDialogProps {
  departmentId: string | null;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  /** Gate name/description edits and the deactivate/reactivate controls. */
  canEdit?: boolean;
  /** Gate the manager control. */
  canAssignManager?: boolean;
  /** Gate the delete control. */
  canDelete?: boolean;
  getDepartment?: GetDepartment;
  onUpdate: UpdateDepartment;
  onAssignManager: AssignManager;
  onDeactivate: DeactivateDepartment;
  onReactivate: ReactivateDepartment;
  onDelete: DeleteDepartment;
  onChanged: (department: Department) => void;
  onDeleted: (id: string) => void;
}

export function DepartmentDetailDialog({
  departmentId,
  onOpenChange,
  ...bodyProps
}: DepartmentDetailDialogProps) {
  return (
    <Dialog
      open={departmentId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {departmentId !== null ? (
          <DepartmentDetailBody
            key={departmentId}
            departmentId={departmentId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface DepartmentDetailBodyProps {
  departmentId: string;
  managers: readonly AssignableUser[];
  canEdit?: boolean;
  canAssignManager?: boolean;
  canDelete?: boolean;
  getDepartment?: GetDepartment;
  onUpdate: UpdateDepartment;
  onAssignManager: AssignManager;
  onDeactivate: DeactivateDepartment;
  onReactivate: ReactivateDepartment;
  onDelete: DeleteDepartment;
  onChanged: (department: Department) => void;
  onDeleted: (id: string) => void;
}

function DepartmentDetailBody({
  departmentId,
  managers,
  canEdit = true,
  canAssignManager = true,
  canDelete = true,
  getDepartment = defaultGetDepartment,
  onUpdate,
  onAssignManager,
  onDeactivate,
  onReactivate,
  onDelete,
  onChanged,
  onDeleted,
}: DepartmentDetailBodyProps) {
  const ids = {
    name: useId(),
    description: useId(),
    manager: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [department, setDepartment] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentProfileValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [managerBusy, setManagerBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirming, setConfirming] = useState<"deactivate" | "delete" | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getDepartment(departmentId)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (loaded) {
          setDepartment(loaded);
          setForm(profileOf(loaded));
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, getDepartment]);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    }
  }, [confirming]);

  function applyDepartment(next: Department) {
    setDepartment(next);
    setForm(profileOf(next));
    onChanged(next);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!department || !form) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const changed = changedFields(profileOf(department), form);
    const outcome = await onUpdate(department.id, changed);

    setSaving(false);
    if (outcome.status === "success") {
      applyDepartment(outcome.department);
      setAnnouncement("Department saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setSaveError(
        Object.values(outcome.fieldErrors)[0] ?? "Check the details.",
      );
      return;
    }
    setSaveError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function handleManagerChange(value: string) {
    if (!department) {
      return;
    }
    const managerId = value === NO_MANAGER ? null : value;
    setManagerBusy(true);
    setManagerError(null);
    const outcome = await onAssignManager(department.id, managerId);
    setManagerBusy(false);

    if (outcome.status === "success") {
      applyDepartment(outcome.department);
      setAnnouncement(managerId ? "Manager assigned." : "Manager removed.");
      return;
    }
    setManagerError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function runStatusChange(next: "deactivate" | "reactivate") {
    if (!department) {
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    const outcome =
      next === "deactivate"
        ? await onDeactivate(department.id)
        : await onReactivate(department.id);
    setStatusBusy(false);
    setConfirming(null);

    if (outcome.status === "success") {
      applyDepartment(outcome.department);
      setAnnouncement(
        next === "deactivate"
          ? "Department deactivated."
          : "Department reactivated.",
      );
      return;
    }
    setStatusError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function runDelete() {
    if (!department) {
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onDelete(department.id);
    setStatusBusy(false);

    if (outcome.status === "success") {
      onDeleted(department.id);
      return;
    }
    setConfirming(null);
    setStatusError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading department…
      </div>
    );
  }

  if (status === "error" || !department || !form) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this department</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const activity = activityOf(department);
  const dirty = changedKeys(profileOf(department), form).length > 0;

  // Keep the current manager selectable even when the picker list did not
  // include them (a read-only caller has no `managers` list of its own).
  const managerOptions =
    department.manager &&
    !managers.some((manager) => manager.id === department.manager!.id)
      ? [department.manager, ...managers]
      : managers;

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{department.name}</DialogTitle>
          <Badge variant={activity === "ACTIVE" ? "default" : "secondary"}>
            {DEPARTMENT_ACTIVITY_LABELS[activity]}
          </Badge>
        </div>
        <DialogDescription>
          {department.employeeCount} employee
          {department.employeeCount === 1 ? "" : "s"}
          {activity === "INACTIVE" && department.deactivatedAt
            ? ` · deactivated ${new Date(department.deactivatedAt).toLocaleDateString()}`
            : null}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        {saveError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{saveError}</AlertTitle>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={ids.name}>Name</Label>
          <Input
            id={ids.name}
            required
            maxLength={120}
            readOnly={!canEdit}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.description}>Description</Label>
          <Input
            id={ids.description}
            maxLength={1000}
            readOnly={!canEdit}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </div>

        {canEdit ? (
          <Button
            type="submit"
            size="sm"
            disabled={!dirty || saving}
            aria-busy={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        ) : null}
      </form>

      <div className="border-border space-y-3 border-t pt-4">
        <div className="space-y-2">
          <Label htmlFor={ids.manager}>Manager</Label>
          <Select
            value={department.manager?.id ?? NO_MANAGER}
            onValueChange={(value) => void handleManagerChange(value)}
            disabled={managerBusy || !canAssignManager}
          >
            <SelectTrigger id={ids.manager} aria-busy={managerBusy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MANAGER}>No manager</SelectItem>
              {managerOptions.map((manager) => (
                <SelectItem key={manager.id} value={manager.id}>
                  {personName(manager)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {managerError ? (
            <p className="text-destructive text-sm" role="alert">
              {managerError}
            </p>
          ) : null}
        </div>

        {canEdit || canDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              activity === "ACTIVE" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirming("deactivate")}
                >
                  Deactivate department
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={statusBusy}
                  aria-busy={statusBusy}
                  onClick={() => void runStatusChange("reactivate")}
                >
                  {statusBusy ? "Reactivating…" : "Reactivate department"}
                </Button>
              )
            ) : null}

            {canDelete && confirming === null ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirming("delete")}
              >
                Delete department
              </Button>
            ) : null}
          </div>
        ) : null}

        {confirming !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              {confirming === "deactivate"
                ? "Deactivate this department?"
                : "Permanently delete this department?"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={statusBusy}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              type="button"
              variant="destructive"
              size="sm"
              disabled={statusBusy}
              aria-busy={statusBusy}
              onClick={() =>
                confirming === "deactivate"
                  ? void runStatusChange("deactivate")
                  : void runDelete()
              }
            >
              {statusBusy
                ? "Working…"
                : confirming === "deactivate"
                  ? "Confirm deactivate"
                  : "Confirm delete"}
            </Button>
          </div>
        ) : null}

        {statusError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{statusError}</AlertTitle>
          </Alert>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function profileOf(department: Department): DepartmentProfileValues {
  return {
    name: department.name,
    description: department.description ?? "",
  };
}

function changedKeys(
  before: DepartmentProfileValues,
  after: DepartmentProfileValues,
): (keyof DepartmentProfileValues)[] {
  return (Object.keys(after) as (keyof DepartmentProfileValues)[]).filter(
    (key) => before[key] !== after[key],
  );
}

function changedFields(
  before: DepartmentProfileValues,
  after: DepartmentProfileValues,
): Partial<DepartmentProfileValues> {
  const changed: Partial<DepartmentProfileValues> = {};
  for (const key of changedKeys(before, after)) {
    changed[key] = after[key];
  }
  return changed;
}
