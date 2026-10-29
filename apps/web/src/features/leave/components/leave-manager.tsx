"use client";

import { useId, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
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
  useBalance,
  useCreateRequestMutation,
  useLeaveTypes,
  useLeaveRequests,
  useWithdrawRequestMutation,
} from "../api/leave-queries";
import { LeaveRequestError } from "../api/leave-gateway";
import { formatDate } from "../lib/leave-date";
import { LEAVE_REQUEST_STATUS_LABELS } from "../lib/leave-types";
import type { LeaveRequest } from "../lib/leave-types";
import { CreateLeaveRequestDialog } from "./create-leave-request-dialog";

export interface LeaveManagerProps {
  access: CurrentAccess;
}

export function LeaveManager({ access }: LeaveManagerProps) {
  const typeSelectId = useId();
  const types = useLeaveTypes(access);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const effectiveTypeId = selectedTypeId ?? types.data?.[0]?.id ?? null;
  const balance = useBalance(access, access.userId, effectiveTypeId);
  const requests = useLeaveRequests(access, { employeeId: access.userId });
  const createMutation = useCreateRequestMutation(access);
  const withdrawMutation = useWithdrawRequestMutation(access);

  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  async function handleWithdraw(request: LeaveRequest) {
    setMessage(null);
    const outcome = await withdrawMutation.mutateAsync(request.id);
    if (outcome.status === "success") {
      setMessage({ text: "Request withdrawn.", ok: true });
      return;
    }
    const text =
      outcome.status === "not_withdrawable"
        ? "Only a still-pending request can be withdrawn."
        : outcome.status === "not_found"
          ? "This request no longer exists."
          : outcome.status === "permission_denied"
            ? "You don't have permission to do that."
            : "Something went wrong. Try again.";
    setMessage({ text, ok: false });
  }

  if (types.isPending) return <p role="status">Loading leave types…</p>;
  if (types.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {types.error instanceof LeaveRequestError
            ? types.error.message
            : "We could not load leave types. Try again."}
        </p>
        <Button variant="outline" onClick={() => void types.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <Alert
          variant={message.ok ? "default" : "destructive"}
          aria-live="assertive"
        >
          <AlertTitle>{message.text}</AlertTitle>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor={typeSelectId}>Leave type</Label>
            <Select
              value={effectiveTypeId ?? ""}
              onValueChange={(value) => setSelectedTypeId(value)}
            >
              <SelectTrigger id={typeSelectId}>
                <SelectValue placeholder="Choose a leave type" />
              </SelectTrigger>
              <SelectContent>
                {(types.data ?? []).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setCreateOpen(true)}>Request leave</Button>
        </div>

        {effectiveTypeId === null ? (
          <p className="text-muted-foreground text-sm">
            No leave types are configured yet.
          </p>
        ) : balance.isPending ? (
          <p role="status">Loading balance…</p>
        ) : balance.isError ? (
          <p role="alert">
            {balance.error instanceof LeaveRequestError
              ? balance.error.message
              : "We could not load your balance. Try again."}
          </p>
        ) : (
          <div className="rounded-xl border p-4">
            <p className="text-2xl font-semibold">
              {balance.data!.totalRemaining} day
              {balance.data!.totalRemaining === 1 ? "" : "s"} remaining
            </p>
            {balance.data!.grants.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                No grants for this type yet.
              </p>
            ) : (
              <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                {balance.data!.grants.map((grant) => (
                  <li key={grant.id}>
                    {grant.remaining} of {grant.grantedDays} days · expires{" "}
                    {formatDate(grant.expiresAt.slice(0, 10))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My requests</h2>
        {requests.isPending ? (
          <p role="status">Loading your requests…</p>
        ) : requests.isError ? (
          <p role="alert">
            {requests.error instanceof LeaveRequestError
              ? requests.error.message
              : "We could not load your requests. Try again."}
          </p>
        ) : (requests.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You have no leave requests yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {(requests.data ?? []).map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-4"
              >
                <div>
                  <p className="font-medium">
                    {request.leaveTypeName} · {formatDate(request.startDate)} –{" "}
                    {formatDate(request.endDate)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {request.daysRequested} day
                    {request.daysRequested === 1 ? "" : "s"} ·{" "}
                    {LEAVE_REQUEST_STATUS_LABELS[request.status]}
                  </p>
                  {request.reviewNote ? (
                    <p className="text-muted-foreground text-sm">
                      “{request.reviewNote}”
                    </p>
                  ) : null}
                </div>
                {request.status === "PENDING" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={withdrawMutation.isPending}
                    onClick={() => void handleWithdraw(request)}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateLeaveRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        types={(types.data ?? []).filter((type) => type.isActive)}
        onCreate={createMutation.mutateAsync}
        onCreated={() =>
          setMessage({ text: "Leave request submitted.", ok: true })
        }
      />
    </div>
  );
}
