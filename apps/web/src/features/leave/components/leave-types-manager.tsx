"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useLeaveTypeMutations, useLeaveTypes } from "../api/leave-queries";
import { LeaveRequestError } from "../api/leave-gateway";
import type { LeaveType } from "../lib/leave-types";
import { CreateLeaveTypeDialog } from "./create-leave-type-dialog";
import { EditLeaveTypeDialog } from "./edit-leave-type-dialog";

export interface LeaveTypesManagerProps {
  access: CurrentAccess;
}

export function LeaveTypesManager({ access }: LeaveTypesManagerProps) {
  const types = useLeaveTypes(access, true);
  const mutations = useLeaveTypeMutations(access);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);

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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>New leave type</Button>
      </div>

      {(types.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No leave types configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {(types.data ?? []).map((type) => (
            <li
              key={type.id}
              className="flex items-center justify-between gap-4 rounded-xl border p-4"
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {type.name}
                  {!type.isActive ? <Badge variant="secondary">Inactive</Badge> : null}
                </p>
                {type.description ? (
                  <p className="text-muted-foreground text-sm">{type.description}</p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {type.isPaid ? "Paid" : "Unpaid"}
                  {type.requiresDocumentation ? " · requires documentation" : ""}
                  {type.requiresApproval ? " · requires approval" : " · auto-approved"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditTarget(type)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CreateLeaveTypeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={mutations.create.mutateAsync}
        onCreated={() => undefined}
      />

      <EditLeaveTypeDialog
        type={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onUpdate={(values) => mutations.update.mutateAsync({ id: editTarget!.id, values })}
        onUpdated={() => undefined}
      />
    </div>
  );
}
