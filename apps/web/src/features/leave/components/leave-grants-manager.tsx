"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import {
  useEligibleEmployees,
  useGrants,
  useGrantMutation,
  useLeaveTypes,
} from "../api/leave-queries";
import { LeaveRequestError } from "../api/leave-gateway";
import { formatDate } from "../lib/leave-date";
import { CreateLeaveGrantDialog } from "./create-leave-grant-dialog";

export interface LeaveGrantsManagerProps {
  access: CurrentAccess;
}

export function LeaveGrantsManager({ access }: LeaveGrantsManagerProps) {
  const employeeSelectId = useId();
  const departmentId = access.department?.id ?? null;
  const employees = useEligibleEmployees(access, departmentId);
  const types = useLeaveTypes(access);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const grants = useGrants(access, employeeId);
  const grantMutation = useGrantMutation(access, employeeId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedEmployee = (employees.data ?? []).find(
    (person) => person.id === employeeId,
  );

  if (departmentId === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Granting leave requires an assigned department.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-sm space-y-2">
        <Label htmlFor={employeeSelectId}>Employee</Label>
        <Select
          value={employeeId ?? ""}
          onValueChange={(value) => setEmployeeId(value || null)}
        >
          <SelectTrigger id={employeeSelectId}>
            <SelectValue placeholder="Choose an employee" />
          </SelectTrigger>
          <SelectContent>
            {(employees.data ?? []).map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {employeeId === null ? (
        <p className="text-muted-foreground text-sm">
          Choose an employee to view and grant their leave balance.
        </p>
      ) : grants.isPending ? (
        <p role="status">Loading grants…</p>
      ) : grants.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {grants.error instanceof LeaveRequestError
              ? grants.error.message
              : "We could not load grants. Try again."}
          </p>
          <Button variant="outline" onClick={() => void grants.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setDialogOpen(true)}>New grant</Button>
          </div>
          {(grants.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No grants recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {(grants.data ?? []).map((grant) => (
                <li key={grant.id} className="rounded-xl border p-4">
                  <p className="font-medium">
                    {grant.leaveTypeName} · {grant.remaining} of{" "}
                    {grant.grantedDays} days remaining
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Granted {formatDate(grant.grantedAt.slice(0, 10))} · expires{" "}
                    {formatDate(grant.expiresAt.slice(0, 10))}
                  </p>
                  {grant.note ? (
                    <p className="text-muted-foreground text-sm">
                      “{grant.note}”
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CreateLeaveGrantDialog
        open={dialogOpen}
        employeeName={selectedEmployee?.name ?? ""}
        types={(types.data ?? []).filter((type) => type.isActive)}
        onOpenChange={setDialogOpen}
        onCreate={grantMutation.mutateAsync}
        onCreated={() => undefined}
      />
    </div>
  );
}
