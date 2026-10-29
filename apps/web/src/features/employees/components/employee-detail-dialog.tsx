"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
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

import { getEmployee as defaultGetEmployee } from "../api/employees-gateway";
import type {
  EmployeeHrValues,
  GetEmployee,
  UpdateEmployee,
  UpdateEmployeeStatus,
} from "../lib/employees-outcome";
import {
  displayName,
  employmentDuration,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  GENDER_LABELS,
  SELECTABLE_GENDERS,
  type Employee,
  type EmploymentStatus,
  type EmploymentType,
} from "../lib/employees-types";

const NONE = "NONE";

const ACTION_ERRORS: Record<string, string> = {
  code_conflict: "Another employee already uses that employee ID.",
  not_found: "This employee no longer exists. Close this and refresh the list.",
  already_in_status: "This employee is already in that employment status.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface EmployeeDetailDialogProps {
  employeeId: string | null;
  onOpenChange: (open: boolean) => void;
  managers: readonly Employee[];
  getEmployee?: GetEmployee;
  onUpdate: UpdateEmployee;
  onUpdateStatus: UpdateEmployeeStatus;
  onChanged: (employee: Employee) => void;
}

export function EmployeeDetailDialog({
  employeeId,
  onOpenChange,
  ...bodyProps
}: EmployeeDetailDialogProps) {
  return (
    <Dialog
      open={employeeId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {employeeId !== null ? (
          <EmployeeDetailBody
            key={employeeId}
            employeeId={employeeId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface EmployeeDetailBodyProps {
  employeeId: string;
  managers: readonly Employee[];
  getEmployee?: GetEmployee;
  onUpdate: UpdateEmployee;
  onUpdateStatus: UpdateEmployeeStatus;
  onChanged: (employee: Employee) => void;
}

function hrValuesOf(employee: Employee): EmployeeHrValues {
  return {
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    personalPhone: employee.personalPhone ?? "",
    position: employee.position,
    employmentType: employee.employmentType,
    employmentDate: employee.employmentDate,
    workLocation: employee.workLocation ?? "",
    reportingManagerId: employee.reportingManagerId,
    grade: employee.grade ?? "",
    description: employee.description ?? "",
    baseSalary: employee.baseSalary ?? "",
    salaryScale: employee.salaryScale ?? "",
    allowanceAmount: employee.allowanceAmount ?? "",
    currency: employee.currency ?? "",
    gender: employee.gender ?? "",
    dateOfBirth: employee.dateOfBirth ?? "",
    city: employee.city ?? "",
    subCity: employee.subCity ?? "",
    woreda: employee.woreda ?? "",
    bankAccountNumber: employee.bankAccountNumber ?? "",
    companyPhone: employee.companyPhone ?? "",
  };
}

function changedKeys(
  before: EmployeeHrValues,
  after: EmployeeHrValues,
): (keyof EmployeeHrValues)[] {
  return (Object.keys(after) as (keyof EmployeeHrValues)[]).filter(
    (key) => before[key] !== after[key],
  );
}

function changedFields(
  before: EmployeeHrValues,
  after: EmployeeHrValues,
): Partial<EmployeeHrValues> {
  return Object.fromEntries(
    changedKeys(before, after).map((key) => [key, after[key]]),
  ) as Partial<EmployeeHrValues>;
}

function EmployeeDetailBody({
  employeeId,
  managers,
  getEmployee = defaultGetEmployee,
  onUpdate,
  onUpdateStatus,
  onChanged,
}: EmployeeDetailBodyProps) {
  const ids = {
    firstName: useId(),
    lastName: useId(),
    personalPhone: useId(),
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
    status: useId(),
  };

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeHrValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EmploymentStatus | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getEmployee(employeeId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setEmployee(loaded);
          setForm(hrValuesOf(loaded));
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, getEmployee]);

  useEffect(() => {
    if (pendingStatus) confirmRef.current?.focus();
  }, [pendingStatus]);

  function applyEmployee(next: Employee) {
    setEmployee(next);
    setForm(hrValuesOf(next));
    onChanged(next);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!employee || !form) return;
    setSaving(true);
    setSaveError(null);

    const changed = changedFields(hrValuesOf(employee), form);
    const outcome = await onUpdate(employee.id, changed);

    setSaving(false);
    if (outcome.status === "success") {
      applyEmployee(outcome.employee);
      setAnnouncement("Employee saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setSaveError(
        Object.values(outcome.fieldErrors)[0] ?? "Check the details.",
      );
      return;
    }
    if (outcome.status === "assignment_invalid") {
      setSaveError(outcome.detail ?? ACTION_ERRORS.unexpected!);
      return;
    }
    setSaveError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  async function runStatusChange(next: EmploymentStatus) {
    if (!employee) return;
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onUpdateStatus(employee.id, next);
    setStatusBusy(false);
    setPendingStatus(null);

    if (outcome.status === "success") {
      applyEmployee(outcome.employee);
      setAnnouncement(
        `Employment status set to ${EMPLOYMENT_STATUS_LABELS[next]}.`,
      );
      return;
    }
    if (outcome.status === "assignment_invalid") {
      setStatusError(outcome.detail ?? ACTION_ERRORS.unexpected!);
      return;
    }
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
        Loading employee…
      </div>
    );
  }

  if (status === "error" || !employee || !form) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this employee</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const dirty = changedKeys(hrValuesOf(employee), form).length > 0;
  const eligibleManagers = managers.filter(
    (manager) => manager.id !== employee.id,
  );

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{displayName(employee)}</DialogTitle>
          <Badge
            variant={
              employee.employmentStatus === "ACTIVE"
                ? "default"
                : employee.employmentStatus === "ON_LEAVE"
                  ? "outline"
                  : "secondary"
            }
          >
            {EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}
          </Badge>
          {employee.userStatus === "INACTIVE" ? (
            <Badge variant="secondary">Login disabled</Badge>
          ) : null}
        </div>
        <DialogDescription>
          {employee.employeeCode} · {employee.email}
          {employee.departmentName
            ? ` · ${employee.departmentName}`
            : ""} · {employmentDuration(employee.employmentDate)}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.personalPhone}>Personal phone</Label>
            <Input
              id={ids.personalPhone}
              value={form.personalPhone}
              onChange={(event) =>
                setForm({ ...form, personalPhone: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.companyPhone}>Company phone</Label>
            <Input
              id={ids.companyPhone}
              value={form.companyPhone}
              onChange={(event) =>
                setForm({ ...form, companyPhone: event.target.value })
              }
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.position}>Position</Label>
            <Input
              id={ids.position}
              value={form.position}
              onChange={(event) =>
                setForm({ ...form, position: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.employmentType}>Employment type</Label>
            <Select
              value={form.employmentType}
              onValueChange={(value) =>
                setForm({ ...form, employmentType: value as EmploymentType })
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.employmentDate}>Employment date</Label>
            <Input
              id={ids.employmentDate}
              type="date"
              value={form.employmentDate}
              onChange={(event) =>
                setForm({ ...form, employmentDate: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.workLocation}>Work location</Label>
            <Input
              id={ids.workLocation}
              value={form.workLocation}
              onChange={(event) =>
                setForm({ ...form, workLocation: event.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.manager}>Reporting manager</Label>
          <Select
            value={form.reportingManagerId ?? NONE}
            onValueChange={(value) =>
              setForm({
                ...form,
                reportingManagerId: value === NONE ? null : value,
              })
            }
          >
            <SelectTrigger id={ids.manager}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No reporting manager</SelectItem>
              {eligibleManagers.map((manager) => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.employeeCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.grade}>Grade</Label>
          <Input
            id={ids.grade}
            value={form.grade}
            onChange={(event) =>
              setForm({ ...form, grade: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.description}>Description</Label>
          <Textarea
            id={ids.description}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </div>

        <div className="border-border space-y-4 border-t pt-4">
          <p className="text-sm font-medium">Compensation</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.baseSalary}>Base salary</Label>
              <Input
                id={ids.baseSalary}
                type="number"
                min={0}
                step="0.01"
                value={form.baseSalary}
                onChange={(event) =>
                  setForm({ ...form, baseSalary: event.target.value })
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
                value={form.allowanceAmount}
                onChange={(event) =>
                  setForm({ ...form, allowanceAmount: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.currency}>Currency</Label>
              <Input
                id={ids.currency}
                maxLength={3}
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value.toUpperCase(),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.salaryScale}>Salary scale</Label>
              <Input
                id={ids.salaryScale}
                value={form.salaryScale}
                onChange={(event) =>
                  setForm({ ...form, salaryScale: event.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.bankAccountNumber}>Bank account number</Label>
            <Input
              id={ids.bankAccountNumber}
              value={form.bankAccountNumber}
              onChange={(event) =>
                setForm({ ...form, bankAccountNumber: event.target.value })
              }
            />
          </div>
          {employee.totalCompensation ? (
            <p className="text-muted-foreground text-sm">
              Total compensation: {employee.totalCompensation}{" "}
              {employee.currency ?? ""}
            </p>
          ) : null}
        </div>

        <div className="border-border space-y-4 border-t pt-4">
          <p className="text-sm font-medium">Personal information</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={ids.gender}>Sex</Label>
              <Select
                value={form.gender || NONE}
                onValueChange={(value) =>
                  setForm({ ...form, gender: value === NONE ? "" : value })
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
                value={form.dateOfBirth}
                onChange={(event) =>
                  setForm({ ...form, dateOfBirth: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={ids.city}>City</Label>
              <Input
                id={ids.city}
                value={form.city}
                onChange={(event) =>
                  setForm({ ...form, city: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.subCity}>Sub-city</Label>
              <Input
                id={ids.subCity}
                value={form.subCity}
                onChange={(event) =>
                  setForm({ ...form, subCity: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={ids.woreda}>Woreda</Label>
              <Input
                id={ids.woreda}
                value={form.woreda}
                onChange={(event) =>
                  setForm({ ...form, woreda: event.target.value })
                }
              />
            </div>
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
        <Label htmlFor={ids.status}>Employment status</Label>
        {pendingStatus ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              Change status to {EMPLOYMENT_STATUS_LABELS[pendingStatus]}?
              {pendingStatus === "INACTIVE"
                ? " This will also disable the employee's login."
                : pendingStatus === "ACTIVE" &&
                    employee.userStatus === "INACTIVE"
                  ? " This will also restore the employee's login."
                  : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={statusBusy}
              onClick={() => setPendingStatus(null)}
            >
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              type="button"
              variant={pendingStatus === "INACTIVE" ? "destructive" : "default"}
              size="sm"
              disabled={statusBusy}
              aria-busy={statusBusy}
              onClick={() => void runStatusChange(pendingStatus)}
            >
              {statusBusy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        ) : (
          <Select
            value={employee.employmentStatus}
            onValueChange={(value) =>
              setPendingStatus(value as EmploymentStatus)
            }
            disabled={statusBusy}
          >
            <SelectTrigger id={ids.status} aria-busy={statusBusy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {EMPLOYMENT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
