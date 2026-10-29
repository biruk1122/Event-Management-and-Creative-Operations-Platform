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

import { useDecideRequestMutation, useLeaveRequests } from "../api/leave-queries";
import { LeaveRequestError } from "../api/leave-gateway";
import { formatDate } from "../lib/leave-date";
import { LEAVE_REQUEST_STATUS_LABELS, LEAVE_REQUEST_STATUSES } from "../lib/leave-types";
import type { LeaveRequest, LeaveRequestStatus } from "../lib/leave-types";
import { DecideLeaveRequestDialog } from "./decide-leave-request-dialog";

export interface LeaveReviewManagerProps {
  access: CurrentAccess;
}

export function LeaveReviewManager({ access }: LeaveReviewManagerProps) {
  const statusSelectId = useId();
  const [status, setStatus] = useState<LeaveRequestStatus>("PENDING");
  const requests = useLeaveRequests(access, { status });
  const mutations = useDecideRequestMutation(access);
  const [target, setTarget] = useState<
    { request: LeaveRequest; decision: "APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES" } | null
  >(null);

  return (
    <div className="space-y-6">
      <div className="max-w-xs space-y-2">
        <Label htmlFor={statusSelectId}>Status</Label>
        <Select value={status} onValueChange={(value) => setStatus(value as LeaveRequestStatus)}>
          <SelectTrigger id={statusSelectId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAVE_REQUEST_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {LEAVE_REQUEST_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {requests.isPending ? (
        <p role="status">Loading requests…</p>
      ) : requests.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {requests.error instanceof LeaveRequestError
              ? requests.error.message
              : "We could not load requests. Try again."}
          </p>
          <Button variant="outline" onClick={() => void requests.refetch()}>
            Try again
          </Button>
        </div>
      ) : (requests.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No requests with this status.</p>
      ) : (
        <ul className="space-y-2">
          {(requests.data ?? []).map((request) => (
            <li
              key={request.id}
              className="flex items-center justify-between gap-4 rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">{request.employeeName ?? "Former employee"}</p>
                <p className="text-muted-foreground text-sm">
                  {request.leaveTypeName} · {formatDate(request.startDate)} –{" "}
                  {formatDate(request.endDate)} · {request.daysRequested} day
                  {request.daysRequested === 1 ? "" : "s"}
                </p>
                {request.reason ? (
                  <p className="text-muted-foreground text-sm">“{request.reason}”</p>
                ) : null}
                {request.reviewNote ? (
                  <p className="text-muted-foreground text-sm">
                    Review note: “{request.reviewNote}”
                  </p>
                ) : null}
              </div>
              {request.status === "PENDING" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setTarget({ request, decision: "APPROVED" })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTarget({ request, decision: "RETURNED_FOR_CHANGES" })
                    }
                  >
                    Return
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setTarget({ request, decision: "REJECTED" })}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <DecideLeaveRequestDialog
        item={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onDecide={(input) => mutations.mutateAsync({ id: target!.request.id, ...input })}
        onDecided={() => undefined}
      />
    </div>
  );
}
