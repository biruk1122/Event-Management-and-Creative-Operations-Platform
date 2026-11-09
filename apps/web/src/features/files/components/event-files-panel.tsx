"use client";

import { useState } from "react";

import { useCurrentAccess } from "@/features/auth/api/access-queries";
import { useEventFiles, useFileMutations } from "../api/files-queries";

import {
  ManagedFilesPanel,
  type ManagedFilesActions,
  type ManagedFilesQuery,
} from "./managed-files-panel";

export type EventFilesPanelProps = {
  eventId: string;
  canRead: boolean;
  canUpdate: boolean;
};

/** Event attachments. The shared panel owns the file list, upload and download. */
export function EventFilesPanel({
  eventId,
  canRead,
  canUpdate,
}: EventFilesPanelProps) {
  const access = useCurrentAccess();
  const queryAccess = access.data ?? { userId: "anonymous", grants: [] };
  const [page, setPage] = useState(1);
  const query = useEventFiles(
    queryAccess,
    eventId,
    page,
    canRead && access.isSuccess,
  );
  const actions = useFileMutations(queryAccess, eventId);
  return (
    <ManagedFilesPanel
      noun="event"
      canRead={canRead}
      canUpdate={canUpdate}
      query={query as unknown as ManagedFilesQuery}
      actions={actions as unknown as ManagedFilesActions}
      page={page}
      onPageChange={setPage}
    />
  );
}
