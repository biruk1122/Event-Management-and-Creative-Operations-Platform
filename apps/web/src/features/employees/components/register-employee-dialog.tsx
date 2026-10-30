"use client";

import { useId, useState, type FormEvent } from "react";
import {
  Briefcase,
  Contact,
  IdCard,
  Search,
  UserRoundPlus,
  UserRoundSearch,
  Wallet,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  findLinkableUsers,
  type AssignableRole,
} from "../api/employees-gateway";
import type {
  RegisterEmployee,
  RegisterEmployeeValues,
} from "../lib/employees-outcome";
import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  GENDER_LABELS,
  SELECTABLE_GENDERS,
  type Employee,
  type EmploymentType,
} from "../lib/employees-types";

const NONE = "NONE";

const FORM_ERRORS: Record<string, string> = {
  code_conflict: "An employee with that employee ID already exists.",
  email_conflict: "A user with that email already exists.",
  user_not_found: "That user account no longer exists.",
  already_linked: "That user already has an employee profile.",
  permission_denied: "You do not have permission to register an employee.",
  unexpected: "We could not register the employee. Try again.",
};

interface RegisterEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: readonly { id: string; name: string }[];
  roles: readonly AssignableRole[];
  managers: readonly Employee[];
  onRegister: RegisterEmployee;
  onRegistered: (employee: Employee) => void;
}

const EMPTY: RegisterEmployeeValues = {
  userId: null,
  email: "",
  firstName: "",
  lastName: "",
  personalPhone: "",
  temporaryPassword: "",
  roleId: null,
  departmentId: null,
  employeeCode: "",
  position: "",
  employmentType: "FULL_TIME",
  employmentDate: "",
  workLocation: "",
  reportingManagerId: null,
  grade: "",
  description: "",
  baseSalary: "",
  salaryScale: "",
  allowanceAmount: "",
  currency: "",
  gender: "",
  dateOfBirth: "",
  city: "",
  subCity: "",
  woreda: "",
  bankAccountNumber: "",
  companyPhone: "",
};

/** A section heading styled as a small icon badge + label, for a `<legend>`. */
function SectionLegend({
  icon: Icon,
  children,
}: {
  icon: typeof Briefcase;
  children: React.ReactNode;
}) {
  return (
    <legend className="mb-1 flex items-center gap-2.5 px-1 text-base font-semibold">
      <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      {children}
    </legend>
  );
}

export function RegisterEmployeeDialog({
  open,
  onOpenChange,
  departments,
  roles,
  managers,
  onRegister,
  onRegistered,
}: RegisterEmployeeDialogProps) {
  const formId = useId();
  const ids = {
    userSearch: useId(),
    email: useId(),
    firstName: useId(),
    lastName: useId(),
    personalPhone: useId(),
    password: useId(),
    role: useId(),
    department: useId(),
    employeeCode: useId(),
    position: useId(),
    employmentType: useId(),
    employmentDate: useId(),
    workLocation: useId(),
    manager: useId(),
    grade: useId(),
    description: useId(),
    baseSalary: useId(),
    salaryScale: useId(),
    allowanceAmount: useId(),
    currency: useId(),
    gender: useId(),
    dateOfBirth: useId(),
    city: useId(),
    subCity: useId(),
    woreda: useId(),
    bankAccountNumber: useId(),
    companyPhone: useId(),
  };

  const [mode, setMode] = useState<"link" | "new">("link");
  const [values, setValues] = useState<RegisterEmployeeValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof RegisterEmployeeValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [userSearching, setUserSearching] = useState(false);
  const [userResults, setUserResults] = useState<
    {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }[]
  >([]);
  const [linkedUser, setLinkedUser] = useState<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null>(null);

  function set<K extends keyof RegisterEmployeeValues>(
    key: K,
    value: RegisterEmployeeValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setValues(EMPTY);
    setFieldErrors({});
    setFormError(null);
    setMode("link");
    setUserSearch("");
    setUserResults([]);
    setLinkedUser(null);
  }

  async function runUserSearch(event: FormEvent) {
    event.preventDefault();
    setUserSearching(true);
    const results = await findLinkableUsers(userSearch);
    setUserSearching(false);
    setUserResults(results);
  }

  function pickUser(user: (typeof userResults)[number]) {
    setLinkedUser(user);
    set("userId", user.id);
  }

  function clearLinkedUser() {
    setLinkedUser(null);
    set("userId", null);
    setUserResults([]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "link" && !values.userId) {
      setFormError("Find and select an existing user account to link.");
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    const outcome = await onRegister(values);

    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onRegistered(outcome.employee);
        reset();
        onOpenChange(false);
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      case "assignment_invalid":
        setFormError(
          outcome.detail ?? "Check the department and role assignment.",
        );
        return;
      default:
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[98vh] max-h-[98vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-[94vw] lg:max-w-300 xl:max-w-340">
        <DialogHeader className="border-border from-accent to-card flex-row items-center justify-between gap-4 border-b bg-linear-to-br px-6 py-5 text-left sm:px-10">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <IdCard aria-hidden="true" className="size-6" />
            </span>
            <div>
              <DialogTitle className="text-xl">Register employee</DialogTitle>
              <DialogDescription>
                Link an existing account, or create a new one, then record the
                employee&apos;s HR details.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <form
            id={formId}
            aria-label="Register employee"
            className="space-y-8"
            onSubmit={(event) => void handleSubmit(event)}
          >
            {formError ? (
              <Alert variant="destructive" aria-live="assertive">
                <AlertTitle>{formError}</AlertTitle>
              </Alert>
            ) : null}

            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Account source"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "link"}
                onClick={() => setMode("link")}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  mode === "link"
                    ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <UserRoundSearch aria-hidden="true" className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    Link existing account
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    Reuse a user already in the system.
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "new"}
                onClick={() => setMode("new")}
                className={cn(
                  "focus-visible:ring-ring/50 flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  mode === "new"
                    ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <UserRoundPlus aria-hidden="true" className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    Create new account
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    Set up a brand-new user and credentials.
                  </span>
                </span>
              </button>
            </div>

            {mode === "link" ? (
              <div className="border-border bg-muted/30 space-y-3 rounded-2xl border p-5 sm:p-6">
                <Label htmlFor={ids.userSearch}>
                  Find user by name or email
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      aria-hidden="true"
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    />
                    <Input
                      id={ids.userSearch}
                      className="pl-9"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={userSearching || !userSearch.trim()}
                    onClick={(event) => void runUserSearch(event)}
                  >
                    {userSearching ? "Searching…" : "Search"}
                  </Button>
                </div>
                {linkedUser ? (
                  <div className="bg-card border-border flex items-center justify-between gap-3 rounded-lg border p-3">
                    <p className="text-sm">
                      Linking:{" "}
                      <strong>
                        {[linkedUser.firstName, linkedUser.lastName]
                          .filter(Boolean)
                          .join(" ") || linkedUser.email}
                      </strong>{" "}
                      <span className="text-muted-foreground">
                        ({linkedUser.email})
                      </span>
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearLinkedUser}
                    >
                      Change
                    </Button>
                  </div>
                ) : userResults.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {userResults.map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          className="focus-visible:ring-ring/50 bg-card border-border hover:border-primary/50 hover:bg-primary/5 w-full rounded-lg border p-3 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
                          onClick={() => pickUser(user)}
                        >
                          <span className="block font-medium">
                            {[user.firstName, user.lastName]
                              .filter(Boolean)
                              .join(" ") || "Unnamed"}
                          </span>
                          <span className="text-muted-foreground block">
                            {user.email}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No account yet, or not found yet? Search above, or switch to
                    &quot;Create new account&quot;.
                  </p>
                )}
              </div>
            ) : (
              <div className="border-border bg-muted/30 space-y-4 rounded-2xl border p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.firstName}>First name</Label>
                    <Input
                      id={ids.firstName}
                      required
                      value={values.firstName}
                      aria-invalid={fieldErrors.firstName ? true : undefined}
                      onChange={(event) => set("firstName", event.target.value)}
                    />
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
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={ids.email}>Email</Label>
                    <Input
                      id={ids.email}
                      type="email"
                      required
                      value={values.email}
                      aria-invalid={fieldErrors.email ? true : undefined}
                      onChange={(event) => set("email", event.target.value)}
                    />
                    {fieldErrors.email ? (
                      <p className="text-destructive text-sm">
                        {fieldErrors.email}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.personalPhone}>
                      Personal phone (optional)
                    </Label>
                    <Input
                      id={ids.personalPhone}
                      type="tel"
                      value={values.personalPhone}
                      aria-invalid={
                        fieldErrors.personalPhone ? true : undefined
                      }
                      onChange={(event) =>
                        set("personalPhone", event.target.value)
                      }
                    />
                    {fieldErrors.personalPhone ? (
                      <p className="text-destructive text-sm">
                        {fieldErrors.personalPhone}
                      </p>
                    ) : null}
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
                      onChange={(event) =>
                        set("temporaryPassword", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.role}>Role</Label>
                    <Select
                      value={values.roleId ?? NONE}
                      onValueChange={(value) =>
                        set("roleId", value === NONE ? null : value)
                      }
                    >
                      <SelectTrigger id={ids.role}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Choose a role</SelectItem>
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
                      value={values.departmentId ?? NONE}
                      onValueChange={(value) =>
                        set("departmentId", value === NONE ? null : value)
                      }
                    >
                      <SelectTrigger id={ids.department}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>
                          Choose a department
                        </SelectItem>
                        {departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <fieldset className="border-border space-y-4 rounded-2xl border p-5 sm:p-6">
                <SectionLegend icon={Briefcase}>
                  Employment information
                </SectionLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.employeeCode}>Employee ID</Label>
                    <Input
                      id={ids.employeeCode}
                      required
                      value={values.employeeCode}
                      aria-invalid={fieldErrors.employeeCode ? true : undefined}
                      onChange={(event) =>
                        set("employeeCode", event.target.value)
                      }
                    />
                    {fieldErrors.employeeCode ? (
                      <p className="text-destructive text-sm">
                        {fieldErrors.employeeCode}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.position}>Position</Label>
                    <Input
                      id={ids.position}
                      required
                      value={values.position}
                      onChange={(event) => set("position", event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.employmentType}>Employment type</Label>
                    <Select
                      value={values.employmentType}
                      onValueChange={(value) =>
                        set("employmentType", value as EmploymentType)
                      }
                    >
                      <SelectTrigger id={ids.employmentType}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {EMPLOYMENT_TYPE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.employmentDate}>Employment date</Label>
                    <Input
                      id={ids.employmentDate}
                      type="date"
                      required
                      value={values.employmentDate}
                      onChange={(event) =>
                        set("employmentDate", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.workLocation}>
                      Work location (optional)
                    </Label>
                    <Input
                      id={ids.workLocation}
                      value={values.workLocation}
                      onChange={(event) =>
                        set("workLocation", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.manager}>
                      Reporting manager (optional)
                    </Label>
                    <Select
                      value={values.reportingManagerId ?? NONE}
                      onValueChange={(value) =>
                        set("reportingManagerId", value === NONE ? null : value)
                      }
                    >
                      <SelectTrigger id={ids.manager}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>
                          No reporting manager
                        </SelectItem>
                        {managers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.employeeCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.grade}>Grade (optional)</Label>
                    <Input
                      id={ids.grade}
                      value={values.grade}
                      onChange={(event) => set("grade", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.companyPhone}>
                      Company phone (optional)
                    </Label>
                    <Input
                      id={ids.companyPhone}
                      type="tel"
                      value={values.companyPhone}
                      aria-invalid={fieldErrors.companyPhone ? true : undefined}
                      onChange={(event) =>
                        set("companyPhone", event.target.value)
                      }
                    />
                    {fieldErrors.companyPhone ? (
                      <p className="text-destructive text-sm">
                        {fieldErrors.companyPhone}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ids.description}>
                    Description (optional)
                  </Label>
                  <Textarea
                    id={ids.description}
                    rows={3}
                    value={values.description}
                    onChange={(event) => set("description", event.target.value)}
                  />
                </div>
              </fieldset>

              <fieldset className="border-border space-y-4 rounded-2xl border p-5 sm:p-6">
                <SectionLegend icon={Wallet}>
                  Compensation (optional)
                </SectionLegend>
                <p className="text-muted-foreground -mt-2 text-sm">
                  Set a currency when recording a base salary or allowance.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.baseSalary}>Base salary</Label>
                    <Input
                      id={ids.baseSalary}
                      type="number"
                      min={0}
                      step="0.01"
                      value={values.baseSalary}
                      onChange={(event) =>
                        set("baseSalary", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.allowanceAmount}>Allowance</Label>
                    <Input
                      id={ids.allowanceAmount}
                      type="number"
                      min={0}
                      step="0.01"
                      value={values.allowanceAmount}
                      onChange={(event) =>
                        set("allowanceAmount", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={ids.currency}>Currency (e.g. ETB)</Label>
                    <Input
                      id={ids.currency}
                      maxLength={3}
                      value={values.currency}
                      onChange={(event) =>
                        set("currency", event.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={ids.salaryScale}>
                      Salary scale (optional)
                    </Label>
                    <Input
                      id={ids.salaryScale}
                      value={values.salaryScale}
                      onChange={(event) =>
                        set("salaryScale", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ids.bankAccountNumber}>
                    Bank account number (optional)
                  </Label>
                  <Input
                    id={ids.bankAccountNumber}
                    value={values.bankAccountNumber}
                    onChange={(event) =>
                      set("bankAccountNumber", event.target.value)
                    }
                  />
                </div>

                <div className="border-border mt-2 space-y-4 border-t pt-4">
                  <SectionLegend icon={Contact}>
                    Personal information (optional)
                  </SectionLegend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={ids.gender}>Sex</Label>
                      <Select
                        value={values.gender || NONE}
                        onValueChange={(value) =>
                          set("gender", value === NONE ? "" : value)
                        }
                      >
                        <SelectTrigger id={ids.gender}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not specified</SelectItem>
                          {SELECTABLE_GENDERS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {GENDER_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={ids.dateOfBirth}>Date of birth</Label>
                      <Input
                        id={ids.dateOfBirth}
                        type="date"
                        value={values.dateOfBirth}
                        onChange={(event) =>
                          set("dateOfBirth", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor={ids.city}>City</Label>
                      <Input
                        id={ids.city}
                        value={values.city}
                        onChange={(event) => set("city", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={ids.subCity}>Sub-city</Label>
                      <Input
                        id={ids.subCity}
                        value={values.subCity}
                        onChange={(event) => set("subCity", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={ids.woreda}>Woreda</Label>
                      <Input
                        id={ids.woreda}
                        value={values.woreda}
                        onChange={(event) => set("woreda", event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>
          </form>
        </div>

        <DialogFooter className="border-border bg-card border-t px-6 py-4 sm:px-10">
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
          <Button
            type="submit"
            form={formId}
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? "Registering…" : "Register employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
