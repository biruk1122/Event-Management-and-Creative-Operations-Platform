"use client";

import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useDetailedSessions } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import { formatDateTime, formatMinutes } from "../lib/attendance-date";
import type { AttendanceSession } from "../lib/attendance-types";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function monthLabel(sessionDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(`${sessionDate}-01T00:00:00Z`));
}

interface MonthGroup {
  key: string;
  label: string;
  sessions: AttendanceSession[];
}

function groupByMonth(sessions: readonly AttendanceSession[]): MonthGroup[] {
  const groups = new Map<string, AttendanceSession[]>();
  for (const session of sessions) {
    const key = session.sessionDate.slice(0, 7);
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, session]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, groupSessions]) => ({
      key,
      label: monthLabel(key),
      sessions: groupSessions,
    }));
}

const SOURCE_LABELS: Record<AttendanceSession["method"], string> = {
  OFFICE_KIOSK: "Kiosk",
  MOBILE_EVENT: "Mobile",
};

export interface AttendanceSessionsManagerProps {
  access: CurrentAccess;
}

export function AttendanceSessionsManager({
  access,
}: AttendanceSessionsManagerProps) {
  const startId = useId();
  const endId = useId();
  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const sessions = useDetailedSessions(access, startDate, endDate);

  const rangeInvalid =
    startDate !== "" && endDate !== "" && endDate < startDate;
  const groups = groupByMonth(sessions.data ?? []);

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
      ) : sessions.isPending ? (
        <p role="status">Loading sessions…</p>
      ) : sessions.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {sessions.error instanceof AttendanceRequestError
              ? sessions.error.message
              : "We could not load sessions. Try again."}
          </p>
          <Button variant="outline" onClick={() => void sessions.refetch()}>
            Try again
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No attendance sessions in this range.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <h3 className="text-lg font-semibold">{group.label}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-2 font-medium">Employee</th>
                    <th className="py-2 font-medium">Check In</th>
                    <th className="py-2 font-medium">Check Out</th>
                    <th className="py-2 font-medium">Worked</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {group.sessions.map((session) => (
                    <tr key={session.id} className="border-t">
                      <td className="py-2">
                        {session.employeeName ?? "Former employee"}
                      </td>
                      <td className="py-2">
                        {formatDateTime(session.checkInAt)}
                      </td>
                      <td className="py-2">
                        {session.checkOutAt ? (
                          formatDateTime(session.checkOutAt)
                        ) : (
                          <span className="flex items-center gap-2">
                            —
                            {session.status === "MISSING_CHECKOUT" ? (
                              <Badge variant="destructive">
                                Missing checkout
                              </Badge>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {formatMinutes(session.netMinutes)}
                      </td>
                      <td className="py-2">
                        {SOURCE_LABELS[session.method]}
                        {session.kioskName ? ` · ${session.kioskName}` : ""}
                        {session.eventName ? ` · ${session.eventName}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
