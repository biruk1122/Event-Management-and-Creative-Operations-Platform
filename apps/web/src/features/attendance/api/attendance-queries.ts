"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./attendance-gateway";
import type {
  HolidayFormValues,
  ShiftFormValues,
  WeekdayScheduleFormValues,
} from "../lib/attendance-outcome";
import type { OvertimeApproval, AttendanceException } from "../lib/attendance-types";

/** Query keys namespaced by the acting user and a signature of their
 * grants, matching `todoKeys`'s own convention - a permission change never
 * serves cache written under a different authority. */
export function attendanceKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["attendance", access.userId, scope] as const;
  return {
    all,
    myShifts: [...all, "my-shifts"] as const,
    mySessions: [...all, "my-sessions"] as const,
    events: [...all, "assignable-events"] as const,
    eligibleEmployees: (departmentId: string) =>
      [...all, "eligible-employees", departmentId] as const,
    eventShifts: (eventId: string) => [...all, "event-shifts", eventId] as const,
    shiftChanges: (eventId: string, shiftId: string) =>
      [...all, "shift-changes", eventId, shiftId] as const,
    shiftAssignments: (eventId: string, shiftId: string) =>
      [...all, "shift-assignments", eventId, shiftId] as const,
    overtime: (status?: string) => [...all, "overtime", status ?? "ALL"] as const,
    exceptions: (status?: string) => [...all, "exceptions", status ?? "ALL"] as const,
    kiosks: [...all, "kiosks"] as const,
    summary: (startDate: string, endDate: string) =>
      [...all, "summary", startDate, endDate] as const,
    detailedSessions: (startDate: string, endDate: string) =>
      [...all, "detailed-sessions", startDate, endDate] as const,
    weekdaySchedule: [...all, "weekday-schedule"] as const,
    holidays: [...all, "holidays"] as const,
  };
}

export function useMyShifts(access: CurrentAccess) {
  return useQuery({
    queryKey: attendanceKeys(access).myShifts,
    queryFn: ({ signal }) => gateway.listMyShifts(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useMySessions(access: CurrentAccess) {
  return useQuery({
    queryKey: attendanceKeys(access).mySessions,
    queryFn: ({ signal }) => gateway.listMySessions(signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function usePunchMutation(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = attendanceKeys(access);
  return useMutation({
    mutationFn: gateway.punchMobile,
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: keys.myShifts });
      await client.invalidateQueries({ queryKey: keys.mySessions });
    },
  });
}

export function useAssignableEvents(access: CurrentAccess) {
  return useQuery({
    queryKey: attendanceKeys(access).events,
    queryFn: ({ signal }) => gateway.listAssignableEvents(signal),
    retry: false,
    staleTime: 60_000,
  });
}

export function useEligibleEmployees(access: CurrentAccess, departmentId: string | null) {
  return useQuery({
    queryKey: attendanceKeys(access).eligibleEmployees(departmentId ?? "none"),
    queryFn: ({ signal }) => gateway.listEligibleEmployees(departmentId!, signal),
    enabled: departmentId !== null,
    retry: false,
    staleTime: 30_000,
  });
}

export function useEventShifts(access: CurrentAccess, eventId: string | null) {
  return useQuery({
    queryKey: attendanceKeys(access).eventShifts(eventId ?? "none"),
    queryFn: ({ signal }) => gateway.listEventShifts(eventId!, signal),
    enabled: eventId !== null,
    retry: false,
  });
}

export function useShiftChanges(
  access: CurrentAccess,
  eventId: string | null,
  shiftId: string | null,
) {
  return useQuery({
    queryKey: attendanceKeys(access).shiftChanges(eventId ?? "none", shiftId ?? "none"),
    queryFn: ({ signal }) => gateway.listShiftChanges(eventId!, shiftId!, signal),
    enabled: eventId !== null && shiftId !== null,
    retry: false,
  });
}

export function useShiftAssignments(
  access: CurrentAccess,
  eventId: string | null,
  shiftId: string | null,
) {
  return useQuery({
    queryKey: attendanceKeys(access).shiftAssignments(eventId ?? "none", shiftId ?? "none"),
    queryFn: ({ signal }) => gateway.listShiftAssignments(eventId!, shiftId!, signal),
    enabled: eventId !== null && shiftId !== null,
    retry: false,
  });
}

export function useShiftMutations(access: CurrentAccess, eventId: string | null) {
  const client = useQueryClient();
  const keys = attendanceKeys(access);
  const reconcile = async () => {
    if (!eventId) return;
    await client.invalidateQueries({ queryKey: keys.eventShifts(eventId) });
  };
  return {
    create: useMutation({
      mutationFn: (values: ShiftFormValues) =>
        gateway.createEventShift(eventId!, values),
      onSettled: reconcile,
    }),
    reschedule: useMutation({
      mutationFn: ({
        shiftId,
        input,
      }: {
        shiftId: string;
        input: { plannedStartAt?: string; plannedEndAt?: string; reason: string };
      }) => gateway.rescheduleEventShift(eventId!, shiftId, input),
      onSettled: async (_result, _error, variables) => {
        await reconcile();
        if (variables) {
          await client.invalidateQueries({
            queryKey: keys.shiftChanges(eventId!, variables.shiftId),
          });
        }
      },
    }),
    cancel: useMutation({
      mutationFn: ({ shiftId, reason }: { shiftId: string; reason: string }) =>
        gateway.cancelEventShift(eventId!, shiftId, reason),
      onSettled: reconcile,
    }),
    reinstate: useMutation({
      mutationFn: ({ shiftId, reason }: { shiftId: string; reason: string }) =>
        gateway.reinstateEventShift(eventId!, shiftId, reason),
      onSettled: reconcile,
    }),
    assign: useMutation({
      mutationFn: ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) =>
        gateway.assignEmployeeToShift(eventId!, shiftId, employeeId),
      onSettled: async (_result, _error, variables) => {
        if (variables) {
          await client.invalidateQueries({
            queryKey: keys.shiftAssignments(eventId!, variables.shiftId),
          });
        }
      },
    }),
    unassign: useMutation({
      mutationFn: ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) =>
        gateway.unassignEmployeeFromShift(eventId!, shiftId, employeeId),
      onSettled: async (_result, _error, variables) => {
        if (variables) {
          await client.invalidateQueries({
            queryKey: keys.shiftAssignments(eventId!, variables.shiftId),
          });
        }
      },
    }),
  };
}

export function useOvertimeList(access: CurrentAccess, status?: OvertimeApproval["status"]) {
  return useQuery({
    queryKey: attendanceKeys(access).overtime(status),
    queryFn: ({ signal }) => gateway.listOvertime(status, signal),
    retry: false,
  });
}

export function useExceptionsList(
  access: CurrentAccess,
  status?: AttendanceException["status"],
) {
  return useQuery({
    queryKey: attendanceKeys(access).exceptions(status),
    queryFn: ({ signal }) => gateway.listExceptions(status, signal),
    retry: false,
  });
}

export function useReviewMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = attendanceKeys(access);
  return {
    decideOvertime: useMutation({
      mutationFn: ({
        id,
        decision,
        approvedMinutes,
        decisionReason,
      }: {
        id: string;
        decision: "APPROVED" | "REJECTED";
        approvedMinutes?: number;
        decisionReason?: string;
      }) => gateway.decideOvertime(id, decision, approvedMinutes, decisionReason),
      onSettled: async () => {
        await client.invalidateQueries({ queryKey: [...keys.all, "overtime"] });
      },
    }),
    decideException: useMutation({
      mutationFn: ({
        id,
        decision,
        reviewNote,
      }: {
        id: string;
        decision: "APPROVED" | "REJECTED";
        reviewNote?: string;
      }) => gateway.decideException(id, decision, reviewNote),
      onSettled: async () => {
        await client.invalidateQueries({ queryKey: [...keys.all, "exceptions"] });
      },
    }),
  };
}

export function useKiosks(access: CurrentAccess) {
  return useQuery({
    queryKey: attendanceKeys(access).kiosks,
    queryFn: ({ signal }) => gateway.listKiosks(signal),
    retry: false,
  });
}

export function useKioskMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = attendanceKeys(access);
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: keys.kiosks });
  };
  return {
    register: useMutation({
      mutationFn: ({ name, locationLabel }: { name: string; locationLabel: string }) =>
        gateway.registerKiosk(name, locationLabel),
      onSettled: reconcile,
    }),
    revoke: useMutation({
      mutationFn: gateway.revokeKiosk,
      onSettled: reconcile,
    }),
  };
}

export function useSummaryReport(access: CurrentAccess, startDate: string, endDate: string) {
  return useQuery({
    queryKey: attendanceKeys(access).summary(startDate, endDate),
    queryFn: ({ signal }) => gateway.getSummaryReport(startDate, endDate, signal),
    retry: false,
    enabled: Boolean(startDate && endDate),
  });
}

export function useDetailedSessions(access: CurrentAccess, startDate: string, endDate: string) {
  return useQuery({
    queryKey: attendanceKeys(access).detailedSessions(startDate, endDate),
    queryFn: ({ signal }) => gateway.getDetailedSessions(startDate, endDate, undefined, signal),
    retry: false,
    enabled: Boolean(startDate && endDate),
  });
}

export function useWeekdaySchedule(access: CurrentAccess) {
  return useQuery({
    queryKey: attendanceKeys(access).weekdaySchedule,
    queryFn: ({ signal }) => gateway.listWeekdaySchedule(signal),
    retry: false,
  });
}

export function useHolidays(access: CurrentAccess) {
  return useQuery({
    queryKey: attendanceKeys(access).holidays,
    queryFn: ({ signal }) => gateway.listHolidays(signal),
    retry: false,
  });
}

export function useCalendarMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = attendanceKeys(access);
  return {
    createWeekdaySchedule: useMutation({
      mutationFn: (values: WeekdayScheduleFormValues) =>
        gateway.createWeekdaySchedule(values),
      onSettled: async () => {
        await client.invalidateQueries({ queryKey: keys.weekdaySchedule });
      },
    }),
    createHoliday: useMutation({
      mutationFn: (values: HolidayFormValues) => gateway.createHoliday(values),
      onSettled: async () => {
        await client.invalidateQueries({ queryKey: keys.holidays });
      },
    }),
    updateHoliday: useMutation({
      mutationFn: ({
        id,
        values,
      }: {
        id: string;
        values: Partial<HolidayFormValues>;
      }) => gateway.updateHoliday(id, values),
      onSettled: async () => {
        await client.invalidateQueries({ queryKey: keys.holidays });
      },
    }),
    removeHoliday: useMutation({
      mutationFn: gateway.removeHoliday,
      onSettled: async () => {
        await client.invalidateQueries({ queryKey: keys.holidays });
      },
    }),
  };
}
