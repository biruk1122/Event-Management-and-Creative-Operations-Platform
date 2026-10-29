"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useLeaveCalendar } from "../api/leave-queries";
import { LeaveRequestError } from "../api/leave-gateway";
import { formatDate } from "../lib/leave-date";
import type { LeaveRequest } from "../lib/leave-types";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function endOfMonth(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

export interface LeaveCalendarManagerProps {
  access: CurrentAccess;
}

export function LeaveCalendarManager({ access }: LeaveCalendarManagerProps) {
  const startId = useId();
  const endId = useId();
  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(endOfMonth());
  const calendar = useLeaveCalendar(access, startDate, endDate);

  const rangeInvalid = startDate !== "" && endDate !== "" && endDate < startDate;

  const byDate = new Map<string, LeaveRequest[]>();
  for (const request of calendar.data ?? []) {
    const existing = byDate.get(request.startDate) ?? [];
    byDate.set(request.startDate, [...existing, request]);
  }
  const sortedDates = [...byDate.keys()].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor={startId}>From</Label>
          <Input
            id={startId}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={endId}>To</Label>
          <Input
            id={endId}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      {rangeInvalid ? (
        <p role="alert" className="text-destructive text-sm">
          The end date must be on or after the start date.
        </p>
      ) : calendar.isPending ? (
        <p role="status">Loading approved leave…</p>
      ) : calendar.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {calendar.error instanceof LeaveRequestError
              ? calendar.error.message
              : "We could not load the calendar. Try again."}
          </p>
          <Button variant="outline" onClick={() => void calendar.refetch()}>
            Try again
          </Button>
        </div>
      ) : sortedDates.length === 0 ? (
        <p className="text-muted-foreground text-sm">No approved leave in this range.</p>
      ) : (
        <ul className="space-y-4">
          {sortedDates.map((date) => (
            <li key={date}>
              <h3 className="font-medium">{formatDate(date)}</h3>
              <ul className="mt-2 space-y-2">
                {(byDate.get(date) ?? []).map((request) => (
                  <li key={request.id} className="rounded-xl border p-3">
                    <p className="font-medium">{request.employeeName ?? "Former employee"}</p>
                    <p className="text-muted-foreground text-sm">
                      {request.leaveTypeName} · through {formatDate(request.endDate)} ·{" "}
                      {request.daysRequested} day{request.daysRequested === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
