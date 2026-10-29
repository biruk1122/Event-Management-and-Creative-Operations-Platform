"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useExceptionsList, useReviewMutations } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import { formatDateTime } from "../lib/attendance-date";
import type { AttendanceException } from "../lib/attendance-types";
import { DecideExceptionDialog } from "./decide-exception-dialog";

const TYPE_LABELS: Record<string, string> = {
  MISSED_CHECKOUT: "Missed checkout",
  OUT_OF_RANGE: "Outside the event location",
  LOCATION_UNAVAILABLE: "No device location",
};

export interface ExceptionReviewManagerProps {
  access: CurrentAccess;
}

export function ExceptionReviewManager({ access }: ExceptionReviewManagerProps) {
  const exceptions = useExceptionsList(access, "PENDING");
  const mutations = useReviewMutations(access);
  const [target, setTarget] = useState<
    { exception: AttendanceException; decision: "APPROVED" | "REJECTED" } | null
  >(null);

  if (exceptions.isPending) return <p role="status">Loading exceptions…</p>;
  if (exceptions.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {exceptions.error instanceof AttendanceRequestError
            ? exceptions.error.message
            : "We could not load exceptions. Try again."}
        </p>
        <Button variant="outline" onClick={() => void exceptions.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(exceptions.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No exceptions pending review.</p>
      ) : (
        <ul className="space-y-2">
          {(exceptions.data ?? []).map((exception) => (
            <li
              key={exception.id}
              className="flex items-center justify-between gap-4 rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">{exception.employeeName ?? "Former employee"}</p>
                <p className="text-muted-foreground text-sm">
                  {TYPE_LABELS[exception.type] ?? exception.type}
                  {exception.requestedCheckInAt
                    ? ` · requested check-in ${formatDateTime(exception.requestedCheckInAt)}`
                    : ""}
                  {exception.requestedCheckOutAt
                    ? ` · requested check-out ${formatDateTime(exception.requestedCheckOutAt)}`
                    : ""}
                </p>
                {exception.description ? (
                  <p className="text-muted-foreground text-sm">“{exception.description}”</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setTarget({ exception, decision: "APPROVED" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setTarget({ exception, decision: "REJECTED" })}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DecideExceptionDialog
        item={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onDecide={(input) =>
          mutations.decideException.mutateAsync({ id: target!.exception.id, ...input })
        }
        onDecided={() => undefined}
      />
    </div>
  );
}
