import { Button } from "@/components/ui/button";

import { CampaignProgress } from "./campaign-progress";
import { CampaignStatusBadge } from "./status-badges";
import {
  campaignTypeLabel,
  personName,
  scheduleSummary,
  type Campaign,
} from "../lib/campaigns-types";

interface CampaignsTableProps {
  campaigns: readonly Campaign[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function managerLabel(campaign: Campaign): string {
  return campaign.manager ? personName(campaign.manager) : "Unassigned";
}

export function CampaignsTable({
  campaigns,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: CampaignsTableProps) {
  if (campaigns.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No campaigns match these filters" : "No campaigns yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New campaign button above to create the first one."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Progress
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Schedule
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(campaign.id)}
                  >
                    {campaign.name}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {campaignTypeLabel(campaign.campaignType)}
                </td>
                <td className="px-4 py-3">
                  <CampaignStatusBadge status={campaign.status} />
                </td>
                <td className="min-w-40 px-4 py-3">
                  <CampaignProgress
                    progress={campaign.progress}
                    label={`Progress of ${campaign.name}`}
                  />
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {scheduleSummary(campaign)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(campaign)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(campaign.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {campaign.name}
                <CampaignStatusBadge status={campaign.status} />
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {campaignTypeLabel(campaign.campaignType)} ·{" "}
                {scheduleSummary(campaign)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(campaign)}
              </span>
            </button>
            <div className="mt-2">
              <CampaignProgress
                progress={campaign.progress}
                label={`Progress of ${campaign.name}`}
              />
            </div>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Campaigns pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
