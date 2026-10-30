import type { AttendanceSessionRecord } from "./infrastructure/attendance.repository.js";
import type { AttendanceSessionResponse } from "./attendance.contracts.js";

export function toAttendanceSessionResponse(
  record: AttendanceSessionRecord,
): AttendanceSessionResponse {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    method: record.method,
    kioskId: record.kioskId,
    kioskName: record.kioskName,
    eventShiftId: record.eventShiftId,
    eventName: record.eventName,
    sessionDate: record.sessionDate.toISOString().slice(0, 10),
    checkInAt: record.checkInAt.toISOString(),
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    status: record.status,
    scheduledMinutes: record.scheduledMinutes,
    actualMinutes: record.actualMinutes,
    breakMinutes: record.breakMinutes,
    netMinutes: record.netMinutes,
    lateMinutes: record.lateMinutes,
    earlyDepartureMinutes: record.earlyDepartureMinutes,
    potentialOvertimeMinutes: record.potentialOvertimeMinutes,
  };
}
