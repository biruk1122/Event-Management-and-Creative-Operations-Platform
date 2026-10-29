"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useOvertimeList, useReviewMutations } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import { formatMinutes } from "../lib/attendance-date";
import type { OvertimeApproval } from "../lib/attendance-types";
import { DecideOvertimeDialog } from "./decide-overtime-dialog";

export interface OvertimeReviewManagerProps {
  access: CurrentAccess;
}

export function OvertimeReviewManager({ access }: OvertimeReviewManagerProps) {
  const overtime = useOvertimeList(access, "PENDING");
  const mutations = useReviewMutations(access);
  const [target, setTarget] = useState<{
    approval: OvertimeApproval;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);

  if (overtime.isPending)
    return <p role="status">Loading overtime requests…</p>;
  if (overtime.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {overtime.error instanceof AttendanceRequestError
            ? overtime.error.message
            : "We could not load overtime requests. Try again."}
        </p>
        <Button variant="outline" onClick={() => void overtime.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(overtime.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No overtime requests pending review.
        </p>
      ) : (
        <ul className="space-y-2">
          {(overtime.data ?? []).map((approval) => (
            <li
              key={approval.id}
              className="flex items-center justify-between gap-4 rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">
                  {approval.employeeName ?? "Former employee"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {approval.sessionDate} · potential{" "}
                  {formatMinutes(approval.potentialMinutes)}
                </p>
                {approval.requestedReason ? (
                  <p className="text-muted-foreground text-sm">
                    “{approval.requestedReason}”
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setTarget({ approval, decision: "APPROVED" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setTarget({ approval, decision: "REJECTED" })}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DecideOvertimeDialog
        item={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onDecide={(input) =>
          mutations.decideOvertime.mutateAsync({
            id: target!.approval.id,
            ...input,
          })
        }
        onDecided={() => undefined}
      />
    </div>
  );
}
