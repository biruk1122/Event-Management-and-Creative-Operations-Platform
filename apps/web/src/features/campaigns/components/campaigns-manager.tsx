"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { assignCampaignManager as defaultAssignManager } from "../api/assign-campaign-manager";
import { assignCampaignTeam as defaultAssignTeam } from "../api/assign-campaign-team";
import { createCampaign as defaultCreateCampaign } from "../api/create-campaign";
import { createCampaignActivity as defaultCreateActivity } from "../api/create-campaign-activity";
import { deleteCampaign as defaultDeleteCampaign } from "../api/delete-campaign";
import { deleteCampaignActivity as defaultDeleteActivity } from "../api/delete-campaign-activity";
import { getCampaign as defaultGetCampaign } from "../api/get-campaign";
import { getCampaignBudget as defaultGetBudget } from "../api/get-campaign-budget";
import { listCampaignActivities as defaultListActivities } from "../api/list-campaign-activities";
import { removeCampaignTeam as defaultRemoveTeam } from "../api/remove-campaign-team";
import { setCampaignBudget as defaultSetBudget } from "../api/set-campaign-budget";
import { transitionCampaign as defaultTransition } from "../api/transition-campaign";
import { updateCampaign as defaultUpdateCampaign } from "../api/update-campaign";
import { updateCampaignActivity as defaultUpdateActivity } from "../api/update-campaign-activity";
import { CampaignDetailDialog } from "./campaign-detail-dialog";
import { CampaignFilters } from "./campaign-filters";
import { CampaignsTable } from "./campaigns-table";
import { CreateCampaignDialog } from "./create-campaign-dialog";
import type {
  AssignCampaignManager,
  AssignCampaignTeam,
  CreateCampaign,
  CreateCampaignActivity,
  DeleteCampaign,
  DeleteCampaignActivity,
  GetCampaign,
  GetCampaignBudget,
  ListCampaignActivities,
  RemoveCampaignTeam,
  SetCampaignBudget,
  TransitionCampaign,
  UpdateCampaign,
  UpdateCampaignActivity,
} from "../lib/campaigns-outcome";
import {
  type AssignableEvent,
  type AssignableTeam,
  type AssignableUser,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
  type PaginatedCampaigns,
} from "../lib/campaigns-types";

const PAGE_SIZE = 10;

interface CampaignsManagerProps {
  initialPage: PaginatedCampaigns;
  assignableUsers: readonly AssignableUser[];
  assignableTeams: readonly AssignableTeam[];
  assignableEvents: readonly AssignableEvent[];
  createCampaign?: CreateCampaign;
  updateCampaign?: UpdateCampaign;
  transitionCampaign?: TransitionCampaign;
  assignManager?: AssignCampaignManager;
  assignTeam?: AssignCampaignTeam;
  removeTeam?: RemoveCampaignTeam;
  setBudget?: SetCampaignBudget;
  deleteCampaign?: DeleteCampaign;
  getCampaign?: GetCampaign;
  getBudget?: GetCampaignBudget;
  listActivities?: ListCampaignActivities;
  createActivity?: CreateCampaignActivity;
  updateActivity?: UpdateCampaignActivity;
  deleteActivity?: DeleteCampaignActivity;
}

export function CampaignsManager({
  initialPage,
  assignableUsers,
  assignableTeams,
  assignableEvents,
  createCampaign = defaultCreateCampaign,
  updateCampaign = defaultUpdateCampaign,
  transitionCampaign = defaultTransition,
  assignManager = defaultAssignManager,
  assignTeam = defaultAssignTeam,
  removeTeam = defaultRemoveTeam,
  setBudget = defaultSetBudget,
  deleteCampaign = defaultDeleteCampaign,
  getCampaign = defaultGetCampaign,
  getBudget = defaultGetBudget,
  listActivities = defaultListActivities,
  createActivity = defaultCreateActivity,
  updateActivity = defaultUpdateActivity,
  deleteActivity = defaultDeleteActivity,
}: CampaignsManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([
    ...initialPage.items,
  ]);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | null>(null);
  const [typeFilter, setTypeFilter] = useState<CampaignType | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (statusFilter && campaign.status !== statusFilter) return false;
      if (typeFilter && campaign.campaignType !== typeFilter) return false;
      if (term === "") return true;
      return campaign.name.toLowerCase().includes(term);
    });
  }, [campaigns, statusFilter, typeFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filtersActive =
    statusFilter !== null || typeFilter !== null || search.trim() !== "";

  function upsert(next: Campaign) {
    setCampaigns((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }

  function remove(id: string) {
    setCampaigns((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
    setAnnouncement("Campaign deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {filtered.length} campaign{filtered.length === 1 ? "" : "s"}
          {filtersActive ? " match these filters" : ""}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New campaign
        </Button>
      </div>

      <CampaignFilters
        status={statusFilter}
        campaignType={typeFilter}
        search={search}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onTypeChange={(value) => {
          setTypeFilter(value);
          setPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />

      <CampaignsTable
        campaigns={visible}
        onSelect={setSelectedId}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={setPage}
        filtered={filtersActive}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        managers={assignableUsers}
        events={assignableEvents}
        onCreate={createCampaign}
        onCreated={(campaign) => {
          upsert(campaign);
          setStatusFilter(null);
          setTypeFilter(null);
          setSearch("");
          setPage(1);
          setAnnouncement("Campaign created.");
        }}
      />

      <CampaignDetailDialog
        campaignId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        users={assignableUsers}
        teams={assignableTeams}
        events={assignableEvents}
        getCampaign={getCampaign}
        getBudget={getBudget}
        listActivities={listActivities}
        onCreateActivity={createActivity}
        onUpdateActivity={updateActivity}
        onDeleteActivity={deleteActivity}
        onUpdate={updateCampaign}
        onTransition={transitionCampaign}
        onAssignManager={assignManager}
        onAssignTeam={assignTeam}
        onRemoveTeam={removeTeam}
        onSetBudget={setBudget}
        onDelete={deleteCampaign}
        onChanged={upsert}
        onDeleted={remove}
      />
    </div>
  );
}
