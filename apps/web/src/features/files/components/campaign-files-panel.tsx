"use client";

import { useState } from "react";

import { useCurrentAccess } from "@/features/auth/api/access-queries";
import {
  useCampaignFileMutations,
  useCampaignFiles,
} from "../api/files-queries";

import {
  ManagedFilesPanel,
  type ManagedFilesActions,
  type ManagedFilesQuery,
} from "./managed-files-panel";

export type CampaignFilesPanelProps = {
  campaignId: string;
  canRead: boolean;
  canUpdate: boolean;
};

/**
 * Files attached to a campaign (EVE-231). Reading needs campaign.read, so the
 * overseeing Marketing Manager can open them; uploading and removing need
 * campaign.update, which the campaign's own department holds.
 */
export function CampaignFilesPanel({
  campaignId,
  canRead,
  canUpdate,
}: CampaignFilesPanelProps) {
  const access = useCurrentAccess();
  const queryAccess = access.data ?? { userId: "anonymous", grants: [] };
  const [page, setPage] = useState(1);
  const query = useCampaignFiles(
    queryAccess,
    campaignId,
    page,
    canRead && access.isSuccess,
  );
  const actions = useCampaignFileMutations(queryAccess, campaignId);
  return (
    <ManagedFilesPanel
      noun="campaign"
      canRead={canRead}
      canUpdate={canUpdate}
      query={query as unknown as ManagedFilesQuery}
      actions={actions as unknown as ManagedFilesActions}
      page={page}
      onPageChange={setPage}
    />
  );
}
