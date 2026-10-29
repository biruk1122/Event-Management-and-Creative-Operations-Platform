"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import * as gateway from "./leave-gateway";
import type {
  LeaveGrantFormValues,
  LeaveRequestFormValues,
  LeaveTypeFormValues,
  UpdateLeaveTypeFormValues,
} from "../lib/leave-outcome";
import type { LeaveRequestStatus } from "../lib/leave-types";

/** Query keys namespaced by the acting user and a signature of their
 * grants, matching `attendanceKeys`'s own convention. */
export function leaveKeys(access: CurrentAccess) {
  const scope = [
    ...new Set(access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`)),
  ]
    .sort()
    .join(",");
  const all = ["leave", access.userId, scope] as const;
  return {
    all,
    types: (includeInactive: boolean) => [...all, "types", includeInactive] as const,
    eligibleEmployees: (departmentId: string) =>
      [...all, "eligible-employees", departmentId] as const,
    grants: (employeeId: string, leaveTypeId?: string) =>
      [...all, "grants", employeeId, leaveTypeId ?? "ALL"] as const,
    balance: (employeeId: string, leaveTypeId: string) =>
      [...all, "balance", employeeId, leaveTypeId] as const,
    requests: (status?: string, employeeId?: string) =>
      [...all, "requests", status ?? "ALL", employeeId ?? "SELF_OR_VISIBLE"] as const,
    calendar: (startDate: string, endDate: string) =>
      [...all, "calendar", startDate, endDate] as const,
  };
}

export function useLeaveTypes(access: CurrentAccess, includeInactive = false) {
  return useQuery({
    queryKey: leaveKeys(access).types(includeInactive),
    queryFn: ({ signal }) => gateway.listLeaveTypes(includeInactive, signal),
    retry: false,
  });
}

export function useLeaveTypeMutations(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = leaveKeys(access);
  const reconcile = async () => {
    await client.invalidateQueries({ queryKey: [...keys.all, "types"] });
  };
  return {
    create: useMutation({
      mutationFn: (values: LeaveTypeFormValues) => gateway.createLeaveType(values),
      onSettled: reconcile,
    }),
    update: useMutation({
      mutationFn: ({ id, values }: { id: string; values: UpdateLeaveTypeFormValues }) =>
        gateway.updateLeaveType(id, values),
      onSettled: reconcile,
    }),
  };
}

export function useEligibleEmployees(access: CurrentAccess, departmentId: string | null) {
  return useQuery({
    queryKey: leaveKeys(access).eligibleEmployees(departmentId ?? "none"),
    queryFn: ({ signal }) => gateway.listEligibleEmployees(departmentId!, signal),
    enabled: departmentId !== null,
    retry: false,
    staleTime: 30_000,
  });
}

export function useGrants(access: CurrentAccess, employeeId: string | null) {
  return useQuery({
    queryKey: leaveKeys(access).grants(employeeId ?? "none"),
    queryFn: ({ signal }) => gateway.listGrants(employeeId!, undefined, signal),
    enabled: employeeId !== null,
    retry: false,
  });
}

export function useBalance(
  access: CurrentAccess,
  employeeId: string | null,
  leaveTypeId: string | null,
) {
  return useQuery({
    queryKey: leaveKeys(access).balance(employeeId ?? "none", leaveTypeId ?? "none"),
    queryFn: ({ signal }) => gateway.getBalance(employeeId!, leaveTypeId!, signal),
    enabled: employeeId !== null && leaveTypeId !== null,
    retry: false,
  });
}

export function useGrantMutation(access: CurrentAccess, employeeId: string | null) {
  const client = useQueryClient();
  const keys = leaveKeys(access);
  return useMutation({
    mutationFn: (values: LeaveGrantFormValues) => gateway.createGrant(employeeId!, values),
    onSettled: async () => {
      if (!employeeId) return;
      await client.invalidateQueries({ queryKey: keys.grants(employeeId) });
      await client.invalidateQueries({ queryKey: [...keys.all, "balance"] });
    },
  });
}

export function useLeaveRequests(
  access: CurrentAccess,
  input: { status?: LeaveRequestStatus; employeeId?: string } = {},
) {
  return useQuery({
    queryKey: leaveKeys(access).requests(input.status, input.employeeId),
    queryFn: ({ signal }) => gateway.listRequests(input, signal),
    retry: false,
  });
}

export function useCreateRequestMutation(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = leaveKeys(access);
  return useMutation({
    mutationFn: (values: LeaveRequestFormValues) => gateway.createRequest(values),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: [...keys.all, "requests"] });
      await client.invalidateQueries({ queryKey: [...keys.all, "balance"] });
      await client.invalidateQueries({ queryKey: [...keys.all, "grants"] });
    },
  });
}

export function useWithdrawRequestMutation(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = leaveKeys(access);
  return useMutation({
    mutationFn: (id: string) => gateway.withdrawRequest(id),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: [...keys.all, "requests"] });
    },
  });
}

export function useDecideRequestMutation(access: CurrentAccess) {
  const client = useQueryClient();
  const keys = leaveKeys(access);
  return useMutation({
    mutationFn: ({
      id,
      decision,
      reviewNote,
    }: {
      id: string;
      decision: "APPROVED" | "REJECTED" | "RETURNED_FOR_CHANGES";
      reviewNote?: string;
    }) => gateway.decideRequest(id, decision, reviewNote),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: [...keys.all, "requests"] });
      await client.invalidateQueries({ queryKey: [...keys.all, "grants"] });
      await client.invalidateQueries({ queryKey: [...keys.all, "balance"] });
    },
  });
}

export function useLeaveCalendar(access: CurrentAccess, startDate: string, endDate: string) {
  return useQuery({
    queryKey: leaveKeys(access).calendar(startDate, endDate),
    queryFn: ({ signal }) => gateway.calendar(startDate, endDate, signal),
    retry: false,
    enabled: Boolean(startDate && endDate),
  });
}
