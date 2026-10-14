import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  downloadEventFile,
  downloadExpenseFile,
  listEventFiles,
  listExpenseFiles,
  removeEventFile,
  uploadEventFile,
  uploadExpenseFile,
} from "./files-gateway";
export const fileKey = (access: CurrentAccess, eventId: string, page: number) =>
  [
    "event-files",
    access.userId,
    access.grants
      .map((g) => `${g.permissionKey}:${g.scope}`)
      .sort()
      .join(","),
    eventId,
    page,
  ] as const;
export function useEventFiles(
  access: CurrentAccess,
  eventId: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: fileKey(access, eventId, page),
    queryFn: ({ signal }) => listEventFiles(eventId, page, signal),
    enabled,
    retry: false,
  });
}
export function useFileMutations(access: CurrentAccess, eventId: string) {
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["event-files", access.userId] });
  return {
    upload: useMutation({
      mutationFn: (file: File) => uploadEventFile(eventId, file),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (fileId: string) => removeEventFile(eventId, fileId),
      onSuccess: invalidate,
    }),
    download: useMutation({
      mutationFn: (fileId: string) => downloadEventFile(eventId, fileId),
    }),
  };
}

export const expenseFileKey = (
  access: CurrentAccess,
  expenseId: string,
  page: number,
) =>
  [
    "expense-files",
    access.userId,
    access.grants
      .map((g) => `${g.permissionKey}:${g.scope}`)
      .sort()
      .join(","),
    expenseId,
    page,
  ] as const;
export function useExpenseFiles(
  access: CurrentAccess,
  expenseId: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: expenseFileKey(access, expenseId, page),
    queryFn: ({ signal }) => listExpenseFiles(expenseId, page, signal),
    enabled,
    retry: false,
  });
}
/** No remove mutation - an expense attachment is an immutable record, same
 * as a Task attachment; there is no delete route on the backend. */
export function useExpenseFileMutations(
  access: CurrentAccess,
  expenseId: string,
) {
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["expense-files", access.userId] });
  return {
    upload: useMutation({
      mutationFn: (file: File) => uploadExpenseFile(expenseId, file),
      onSuccess: invalidate,
    }),
    download: useMutation({
      mutationFn: (fileId: string) => downloadExpenseFile(expenseId, fileId),
    }),
  };
}
