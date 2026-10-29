"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { useSummaryReport } from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import { formatMinutes } from "../lib/attendance-date";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function startOfMonth(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export interface AttendanceReportManagerProps {
  access: CurrentAccess;
}

export function AttendanceReportManager({
  access,
}: AttendanceReportManagerProps) {
  const startId = useId();
  const endId = useId();
  const [startDate, setStartDate] = useState(startOfMonth());
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const report = useSummaryReport(access, startDate, endDate);

  const rangeInvalid =
    startDate !== "" && endDate !== "" && endDate < startDate;

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
      ) : report.isPending ? (
        <p role="status">Loading the report…</p>
      ) : report.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {report.error instanceof AttendanceRequestError
              ? report.error.message
              : "We could not load the report. Try again."}
          </p>
          <Button variant="outline" onClick={() => void report.refetch()}>
            Try again
          </Button>
        </div>
      ) : (report.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No attendance sessions or approved leave in this range.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-2 font-medium">Employee</th>
              <th className="py-2 font-medium">Sessions</th>
              <th className="py-2 font-medium">Actual</th>
              <th className="py-2 font-medium">Late</th>
              <th className="py-2 font-medium">Early departure</th>
              <th className="py-2 font-medium">Approved overtime</th>
              <th className="py-2 font-medium">Potential overtime</th>
              <th className="py-2 font-medium">Scheduled</th>
              <th className="py-2 font-medium">Present</th>
              <th className="py-2 font-medium">Absent</th>
              <th className="py-2 font-medium">On leave</th>
            </tr>
          </thead>
          <tbody>
            {(report.data ?? []).map((row) => (
              <tr key={row.employeeId} className="border-t">
                <td className="py-2">
                  {row.employeeName ?? "Former employee"}
                </td>
                <td className="py-2">{row.sessionsCount}</td>
                <td className="py-2">{formatMinutes(row.actualMinutes)}</td>
                <td className="py-2">{formatMinutes(row.lateMinutes)}</td>
                <td className="py-2">
                  {formatMinutes(row.earlyDepartureMinutes)}
                </td>
                <td className="py-2">
                  {formatMinutes(row.approvedOvertimeMinutes)}
                </td>
                <td className="py-2">
                  {formatMinutes(row.potentialOvertimeMinutes)}
                </td>
                <td className="py-2">{formatDays(row.scheduledDays)}</td>
                <td className="py-2">{formatDays(row.presentDays)}</td>
                <td className="py-2">{formatDays(row.absentDays)}</td>
                <td className="py-2">
                  {row.onLeaveDays > 0 ? formatDays(row.onLeaveDays) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
