"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { listCampaigns } from "@/features/campaigns/api/campaigns-gateway";
import { collectAllPages } from "@/lib/collect-all-pages";

interface CampaignChoice {
  workspaceId: string;
  name: string;
}

/**
 * EVE-234: the one campaign a completion report is about. The report links
 * the campaign's workspace, the same checked link other reports use; the API
 * confirms the author can read that campaign.
 */
export function ReportCampaignField({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (workspaceId: string) => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignChoice[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    collectAllPages((page) =>
      listCampaigns({ page, pageSize: 100 }, controller.signal),
    ).then(
      (items) => {
        if (controller.signal.aborted) return;
        setCampaigns(
          items.map((item) => ({
            workspaceId: item.workspaceId,
            name: item.name,
          })),
        );
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={id}>Campaign</Label>
      <select
        id={id}
        name="campaignWorkspaceId"
        value={value}
        required
        disabled={disabled || campaigns === null}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
        className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2"
      >
        <option value="">
          {campaigns === null && !failed
            ? "Loading campaigns…"
            : "Choose a campaign"}
        </option>
        {(campaigns ?? []).map((campaign) => (
          <option key={campaign.workspaceId} value={campaign.workspaceId}>
            {campaign.name}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        {failed
          ? "Campaigns could not be loaded. Close the form and try again."
          : "The campaign this report closes out. Set the period to the campaign's dates."}
      </p>
    </div>
  );
}
