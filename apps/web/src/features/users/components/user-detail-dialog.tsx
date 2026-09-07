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

import { getUser as defaultGetUser, type GetUser } from "../api/get-user";
import type {
  AssignRole,
  DeactivateUser,
  ProfileValues,
  ReactivateUser,
  UpdateUser,
} from "../lib/users-outcome";
import {
  displayName,
  USER_STATUS_LABELS,
  type User,
  type UserRoleSummary,
} from "../lib/users-types";

const NO_ROLE = "NONE";

const ACTION_ERRORS: Record<string, string> = {
  email_conflict: "Another user already uses that email.",
  role_not_found: "That role no longer exists.",
  already_inactive: "This user is already deactivated.",
  already_active: "This user is already active.",
  not_found: "This user no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface UserDetailDialogProps {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
  roles: readonly UserRoleSummary[];
  getUser?: GetUser;
  onUpdate: UpdateUser;
  onDeactivate: DeactivateUser;
  onReactivate: ReactivateUser;
  onAssignRole: AssignRole;
  onChanged: (user: User) => void;
}

export function UserDetailDialog({
  userId,
  onOpenChange,
  ...bodyProps
}: UserDetailDialogProps) {
  return (
    <Dialog
      open={userId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {userId !== null ? (
          <UserDetailBody key={userId} userId={userId} {...bodyProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface UserDetailBodyProps {
  userId: string;
  roles: readonly UserRoleSummary[];
  getUser?: GetUser;
  onUpdate: UpdateUser;
  onDeactivate: DeactivateUser;
  onReactivate: ReactivateUser;
  onAssignRole: AssignRole;
  onChanged: (user: User) => void;
}

function UserDetailBody({
  userId,
  roles,
  getUser = defaultGetUser,
  onUpdate,
  onDeactivate,
  onReactivate,
  onAssignRole,
  onChanged,
}: UserDetailBodyProps) {
  const ids = {
    email: useId(),
    firstName: useId(),
    lastName: useId(),
    phone: useId(),
    profileImage: useId(),
    role: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<ProfileValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getUser(userId).then((loaded) => {
      if (cancelled) {
        return;
      }
      if (loaded) {
        setUser(loaded);
        setForm(profileOf(loaded));
        setStatus("loaded");
      } else {
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, getUser]);

  useEffect(() => {
    if (confirmingDeactivate) {
      confirmRef.current?.focus();
    }
  }, [confirmingDeactivate]);

  function applyUser(next: User) {
    setUser(next);
    setForm(profileOf(next));
    onChanged(next);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!user || !form) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const changed = changedFields(profileOf(user), form);
    const outcome = await onUpdate(user.id, changed);

    setSaving(false);
    if (outcome.status === "success") {
      applyUser(outcome.user);
      setAnnouncement("Profile saved.");
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

  async function runStatusChange(next: "deactivate" | "reactivate") {
    if (!user) {
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    const outcome =
      next === "deactivate"
        ? await onDeactivate(user.id)
        : await onReactivate(user.id);
    setStatusBusy(false);
    setConfirmingDeactivate(false);

    if (outcome.status === "success") {
      applyUser(outcome.user);
      setAnnouncement(
        next === "deactivate" ? "User deactivated." : "User reactivated.",
      );
      return;
    }
    setStatusError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function handleRoleChange(value: string) {
    if (!user) {
      return;
    }
    const roleId = value === NO_ROLE ? null : value;
    setRoleBusy(true);
    setRoleError(null);
    const outcome = await onAssignRole(user.id, roleId);
    setRoleBusy(false);

    if (outcome.status === "success") {
      applyUser(outcome.user);
      setAnnouncement(roleId ? "Role assigned." : "Role removed.");
      return;
    }
    setRoleError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading user…
      </div>
    );
  }

  if (status === "error" || !user || !form) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this user</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const dirty = changedKeys(profileOf(user), form).length > 0;

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{displayName(user)}</DialogTitle>
          <Badge variant={user.status === "ACTIVE" ? "default" : "secondary"}>
            {USER_STATUS_LABELS[user.status]}
          </Badge>
          {user.mustChangePassword ? (
            <Badge variant="outline">Password pending</Badge>
          ) : null}
        </div>
        <DialogDescription>
          {user.email}
          {user.status === "INACTIVE" && user.deactivatedAt
            ? ` · deactivated ${new Date(user.deactivatedAt).toLocaleDateString()}`
            : null}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        {saveError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{saveError}</AlertTitle>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.firstName}>First name</Label>
            <Input
              id={ids.firstName}
              value={form.firstName}
              onChange={(event) =>
                setForm({ ...form, firstName: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.lastName}>Last name</Label>
            <Input
              id={ids.lastName}
              value={form.lastName}
              onChange={(event) =>
                setForm({ ...form, lastName: event.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.email}>Email</Label>
          <Input
            id={ids.email}
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.phone}>Phone</Label>
            <Input
              id={ids.phone}
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.profileImage}>Profile photo</Label>
            <Input
              id={ids.profileImage}
              value={form.profileImage}
              onChange={(event) =>
                setForm({ ...form, profileImage: event.target.value })
              }
            />
          </div>
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={!dirty || saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="border-border space-y-3 border-t pt-4">
        <div className="space-y-2">
          <Label htmlFor={ids.role}>Role</Label>
          <Select
            value={user.role?.id ?? NO_ROLE}
            onValueChange={(value) => void handleRoleChange(value)}
            disabled={roleBusy}
          >
            <SelectTrigger id={ids.role} aria-busy={roleBusy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROLE}>No role (baseline access)</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roleError ? (
            <p className="text-destructive text-sm" role="alert">
              {roleError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.status === "ACTIVE" ? (
            confirmingDeactivate ? (
              <>
                <span className="text-sm">Deactivate this user?</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={statusBusy}
                  onClick={() => setConfirmingDeactivate(false)}
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
                  onClick={() => void runStatusChange("deactivate")}
                >
                  {statusBusy ? "Deactivating…" : "Confirm deactivate"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmingDeactivate(true)}
              >
                Deactivate user
              </Button>
            )
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={statusBusy}
              aria-busy={statusBusy}
              onClick={() => void runStatusChange("reactivate")}
            >
              {statusBusy ? "Reactivating…" : "Reactivate user"}
            </Button>
          )}
        </div>
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

function profileOf(user: User): ProfileValues {
  return {
    email: user.email,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
    profileImage: user.profileImage ?? "",
  };
}

function changedKeys(
  before: ProfileValues,
  after: ProfileValues,
): (keyof ProfileValues)[] {
  return (Object.keys(after) as (keyof ProfileValues)[]).filter(
    (key) => before[key] !== after[key],
  );
}

function changedFields(
  before: ProfileValues,
  after: ProfileValues,
): Partial<ProfileValues> {
  const changed: Partial<ProfileValues> = {};
  for (const key of changedKeys(before, after)) {
    changed[key] = after[key];
  }
  return changed;
}
