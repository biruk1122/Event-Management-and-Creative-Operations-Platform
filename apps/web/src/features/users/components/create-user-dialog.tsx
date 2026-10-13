"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { CreateUser, CreateUserValues } from "../lib/users-outcome";
import type { User, UserRoleSummary } from "../lib/users-types";

const NO_ROLE = "NONE";

const FORM_ERRORS: Record<string, string> = {
  email_conflict: "A user with that email already exists.",
  role_not_found: "That role no longer exists. Pick another.",
  assignment_invalid:
    "Choose a supported role and active department. Department roles require a department.",
  permission_denied: "You do not have permission to create a user.",
  unexpected: "We could not create the user. Try again.",
};

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: readonly UserRoleSummary[];
  departments?: readonly UserRoleSummary[];
  onCreate: CreateUser;
  onCreated: (user: User) => void;
}

const EMPTY: CreateUserValues = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  profileImage: "",
  temporaryPassword: "",
  roleId: null,
  departmentId: null,
};

export function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  departments = [],
  onCreate,
  onCreated,
}: CreateUserDialogProps) {
  const ids = {
    email: useId(),
    firstName: useId(),
    lastName: useId(),
    phone: useId(),
    profileImage: useId(),
    password: useId(),
    role: useId(),
    department: useId(),
  };

  const [values, setValues] = useState<CreateUserValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateUserValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CreateUserValues>(
    key: K,
    value: CreateUserValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setValues(EMPTY);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const chosenRole = roles.find((role) => role.id === values.roleId);
    if (
      !chosenRole ||
      (chosenRole.name !== "Super Admin" && !values.departmentId)
    ) {
      setFormError(FORM_ERRORS.assignment_invalid!);
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    const outcome = await onCreate(values);

    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.user);
        reset();
        onOpenChange(false);
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Create an account with a temporary password the user must change on
            first sign-in.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create user"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.firstName}>First name</Label>
              <Input
                id={ids.firstName}
                autoFocus
                required
                value={values.firstName}
                aria-invalid={fieldErrors.firstName ? true : undefined}
                onChange={(event) => set("firstName", event.target.value)}
              />
              {fieldErrors.firstName ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.firstName}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.lastName}>Last name</Label>
              <Input
                id={ids.lastName}
                required
                value={values.lastName}
                aria-invalid={fieldErrors.lastName ? true : undefined}
                onChange={(event) => set("lastName", event.target.value)}
              />
              {fieldErrors.lastName ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.lastName}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.email}>Email</Label>
            <Input
              id={ids.email}
              type="email"
              autoComplete="off"
              required
              value={values.email}
              aria-invalid={fieldErrors.email ? true : undefined}
              onChange={(event) => set("email", event.target.value)}
            />
            {fieldErrors.email ? (
              <p className="text-destructive text-sm">{fieldErrors.email}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.phone}>Phone (optional)</Label>
              <Input
                id={ids.phone}
                value={values.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.profileImage}>Profile photo (optional)</Label>
              <Input
                id={ids.profileImage}
                placeholder="URL or storage key"
                value={values.profileImage}
                onChange={(event) => set("profileImage", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.password}>Temporary password</Label>
            <Input
              id={ids.password}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={values.temporaryPassword}
              aria-invalid={fieldErrors.temporaryPassword ? true : undefined}
              onChange={(event) => set("temporaryPassword", event.target.value)}
            />
            {fieldErrors.temporaryPassword ? (
              <p className="text-destructive text-sm">
                {fieldErrors.temporaryPassword}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.role}>Role</Label>
            <Select
              value={values.roleId ?? NO_ROLE}
              onValueChange={(value) =>
                set("roleId", value === NO_ROLE ? null : value)
              }
            >
              <SelectTrigger id={ids.role}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROLE}>Choose a role</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.department}>Department</Label>
            <Select
              value={values.departmentId ?? NO_ROLE}
              onValueChange={(value) =>
                set("departmentId", value === NO_ROLE ? null : value)
              }
            >
              <SelectTrigger id={ids.department}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROLE}>Choose a department</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              Required for department managers and members.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
