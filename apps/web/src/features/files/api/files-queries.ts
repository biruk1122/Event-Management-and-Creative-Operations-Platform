import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import {
  downloadEventFile,
  listEventFiles,
  removeEventFile,
  uploadEventFile,
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
