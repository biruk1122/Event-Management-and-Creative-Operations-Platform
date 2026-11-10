"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  IdCard,
  Mail,
  Pencil,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { listDepartments } from "@/features/departments/api/departments-gateway";
import {
  accessKey,
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from "@/features/employees/lib/employees-types";
import { listEmployees } from "@/features/employees/api/employees-gateway";
import { APP_TIME_ZONE, formatInZone } from "@/lib/app-timezone";

import { getUser, listAssignableRoles } from "../api/users-gateway";
import { userKeys, useUsersMutations } from "../api/users-queries";
import { UserDetailDialog } from "./user-detail-dialog";
import { initialsFor, UserStatusBadge } from "./users-table";
import { displayName, USER_STATUS_LABELS, type User } from "../lib/users-types";

const STATUS_ERRORS: Record<string, string> = {
  already_inactive: "This user is already deactivated.",
  already_active: "This user is already active.",
  not_found: "This user no longer exists.",
  permission_denied: "You do not have permission to change this account.",
  unexpected: "We could not change that account. Try again.",
};

function can(access: CurrentAccess, permission: string) {
  return access.grants.some(
    (grant) =>
      grant.permissionKey === permission && grant.scope === "ORGANIZATION",
  );
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInZone(
    iso,
    { day: "numeric", month: "short", year: "numeric" },
    APP_TIME_ZONE,
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="border-border bg-card space-y-4 rounded-2xl border p-5 shadow-xs"
    >
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * One user's details: profile, access, account and the linked employee
 * record. Editing reuses the existing user editor; activation and
 * deactivation reuse the existing mutations and keep their confirmation.
 */
export function UserDetailsScreen({ userId }: { userId: string }) {
  const access = useCurrentAccess();
  if (!access.data) return null;
  return <UserDetailsBody key={userId} userId={userId} access={access.data} />;
}

function UserDetailsBody({
  userId,
  access,
}: {
  userId: string;
  access: CurrentAccess;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const params = useSearchParams();
  const keys = userKeys(access);
  const mutations = useUsersMutations(access);

  const [editOpen, setEditOpen] = useState(params.get("edit") === "1");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const canEdit = can(access, "user.update");
  const canDeactivate = can(access, "user.deactivate");
  const canActivate = can(access, "user.manage_status");
  const canAssignDepartment = can(access, "user.assign_department");

  const userQuery = useQuery({
    queryKey: keys.detail(userId),
    queryFn: ({ signal }) => getUser(userId, signal),
    retry: false,
  });
  const user = userQuery.data ?? null;

  const rolesQuery = useQuery({
    queryKey: keys.roles,
    queryFn: ({ signal }) => listAssignableRoles(signal),
    retry: false,
    staleTime: 60_000,
    enabled: canEdit,
  });

  const departmentsQuery = useQuery({
    queryKey: [...keys.all, "assignable-departments"],
    queryFn: ({ signal }) =>
      listDepartments({ status: "ACTIVE", page: 1, pageSize: 100 }, signal),
    enabled: canEdit && canAssignDepartment,
    retry: false,
  });

  // The employee record is linked by user id; the list is searched by the
  // user's email and the exact match is kept.
  const employeeQuery = useQuery({
    queryKey: [...keys.all, "employee-for-user", userId],
    queryFn: ({ signal }) =>
      user
        ? listEmployees({ search: user.email, pageSize: 10 }, signal).then(
            (result) =>
              result.items.find((employee) => employee.userId === user.id) ??
              null,
          )
        : Promise.resolve(null),
    enabled: user !== null,
    retry: false,
  });
  const employee = employeeQuery.data ?? null;

  function closeEditor() {
    setEditOpen(false);
    if (params.get("edit") === "1") {
      router.replace(`/users/${userId}` as Route, { scroll: false });
    }
  }

  function applyUpdated(next: User) {
    client.setQueryData(keys.detail(userId), next);
    setAnnouncement("User saved.");
  }

  async function confirmStatusChange() {
    if (!user) return;
    setStatusBusy(true);
    setStatusError(null);
    const next = user.status === "ACTIVE" ? "deactivate" : "reactivate";
    const outcome =
      next === "deactivate"
        ? await mutations.deactivate.mutateAsync(user.id)
        : await mutations.reactivate.mutateAsync(user.id);
    setStatusBusy(false);
    if (outcome.status === "success") {
      setConfirmOpen(false);
      client.setQueryData(keys.detail(userId), outcome.user);
      setAnnouncement(
        next === "deactivate" ? "User deactivated." : "User reactivated.",
      );
      void client.invalidateQueries({ queryKey: accessKey });
      return;
    }
    setStatusError(STATUS_ERRORS[outcome.status] ?? STATUS_ERRORS.unexpected!);
  }

  if (userQuery.isPending) {
    return (
      <p role="status" className="py-10 text-sm">
        Loading user…
      </p>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <div role="alert" className="space-y-3">
        <p>This user could not be loaded. They may no longer exist.</p>
        <Link
          href={"/users" as Route}
          className="text-sm underline underline-offset-4"
        >
          Back to users
        </Link>
      </div>
    );
  }

  const isSuperAdmin = user.role?.name === "Super Admin";
  const toggleAllowed = user.status === "ACTIVE" ? canDeactivate : canActivate;
  const toggleDisabled =
    !toggleAllowed || (user.status === "ACTIVE" && isSuperAdmin);

  return (
    <div className="space-y-6">
      <Link
        href={"/users" as Route}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to users
      </Link>

      <header className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="bg-primary/15 text-primary flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
          >
            {initialsFor(user)}
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {displayName(user)}
              </h1>
              <UserStatusBadge status={user.status} />
              {user.mustChangePassword ? (
                <Badge variant="outline">Password pending</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Mail aria-hidden="true" className="size-4" />
              {user.email}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button type="button" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden="true" data-icon="inline-start" />
              Edit user
            </Button>
          ) : null}
          {toggleAllowed ? (
            <Button
              type="button"
              variant={user.status === "ACTIVE" ? "outline" : "default"}
              disabled={toggleDisabled}
              onClick={() => {
                setStatusError(null);
                setConfirmOpen(true);
              }}
            >
              {user.status === "ACTIVE" ? (
                <UserRoundX aria-hidden="true" data-icon="inline-start" />
              ) : (
                <UserRoundCheck aria-hidden="true" data-icon="inline-start" />
              )}
              {user.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon={UserRound} title="Profile">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">{user.firstName}</Field>
            <Field label="Last name">{user.lastName}</Field>
            <Field label="Email">{user.email}</Field>
            <Field label="Phone">{user.phone}</Field>
          </dl>
        </Section>

        <Section icon={ShieldCheck} title="Access">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">{user.role?.name ?? "No role"}</Field>
            <Field label="Department">
              {user.department?.name ?? "No department"}
            </Field>
          </dl>
        </Section>

        <Section icon={UserRoundCheck} title="Account">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">{USER_STATUS_LABELS[user.status]}</Field>
            <Field label="Created">{dateLabel(user.createdAt)}</Field>
            <Field label="Deactivated">
              {user.deactivatedAt ? dateLabel(user.deactivatedAt) : "—"}
            </Field>
            <Field label="Sign-in">
              {user.mustChangePassword
                ? "Must change the temporary password"
                : "Password set"}
            </Field>
          </dl>
        </Section>

        <Section icon={IdCard} title="Employee record">
          {employeeQuery.isPending ? (
            <p role="status" className="text-muted-foreground text-sm">
              Looking for an employee record…
            </p>
          ) : employee ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Employee ID">{employee.employeeCode}</Field>
              <Field label="Position">{employee.position}</Field>
              <Field label="Department">{employee.departmentName}</Field>
              <Field label="Employment">
                {EMPLOYMENT_TYPE_LABELS[employee.employmentType]} ·{" "}
                {EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}
              </Field>
              <Field label="Employment date">
                {dateLabel(employee.employmentDate)}
              </Field>
              <Field label="Work location">{employee.workLocation}</Field>
            </dl>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Building2 aria-hidden="true" className="size-4" />
              No employee record is linked to this account yet.
            </p>
          )}
        </Section>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {canEdit ? (
        <UserDetailDialog
          userId={editOpen ? userId : null}
          onOpenChange={(open) => {
            if (!open) closeEditor();
          }}
          roles={rolesQuery.data ?? []}
          departments={departmentsQuery.data?.items ?? []}
          onUpdate={(id, values) =>
            mutations.update.mutateAsync({ id, values })
          }
          onDeactivate={mutations.deactivate.mutateAsync}
          onReactivate={mutations.reactivate.mutateAsync}
          onAssignRole={(id, roleId) =>
            mutations.assignRole.mutateAsync({ id, roleId })
          }
          onChanged={applyUpdated}
        />
      ) : null}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setConfirmOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {user.status === "ACTIVE"
                ? `Deactivate ${displayName(user)}?`
                : `Activate ${displayName(user)}?`}
            </DialogTitle>
            <DialogDescription>
              {user.status === "ACTIVE"
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
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={user.status === "ACTIVE" ? "destructive" : "default"}
              disabled={statusBusy}
              aria-busy={statusBusy}
              onClick={() => void confirmStatusChange()}
            >
              {statusBusy
                ? user.status === "ACTIVE"
                  ? "Deactivating…"
                  : "Activating…"
                : user.status === "ACTIVE"
                  ? "Deactivate"
                  : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
