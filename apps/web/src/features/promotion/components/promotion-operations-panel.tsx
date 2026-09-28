"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { campaignKeys } from "@/features/campaigns/api/campaigns-queries";

import * as gateway from "../api/promotion-gateway";
import { PromotionOperationsBoard } from "./promotion-operations-board";

function hasGrant(access: CurrentAccess, key: string) {
  return access.grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

export function PromotionOperationsPanel({
  campaignId,
  campaignName,
  access,
}: {
  campaignId: string;
  campaignName: string;
  access: CurrentAccess;
}) {
  const client = useQueryClient();
  const campaign = campaignKeys(access);
  const promotionKey = [...campaign.all, "promotion", campaignId] as const;
  const canRead = hasGrant(access, "campaign.read");
  const canManage = hasGrant(access, "campaign.activity.manage");
  const canReadTalent = hasGrant(access, "talent.read");
  const canAssignTalent = canManage && hasGrant(access, "talent.assign");

  const activities = useQuery({
    queryKey: campaign.activities(campaignId),
    queryFn: ({ signal }) => gateway.listSharedActivities(campaignId, signal),
    enabled: canRead,
    retry: false,
  });
  const promotion = useQuery({
    queryKey: promotionKey,
    queryFn: ({ signal }) =>
      gateway.listPromotionActivities(campaignId, signal),
    enabled: canRead,
    retry: false,
  });
  const talents = useQuery({
    queryKey: [...campaign.all, "promotion-talents"],
    queryFn: ({ signal }) => gateway.listPromotionTalents(signal),
    enabled: canRead && canReadTalent,
    retry: false,
    staleTime: 60_000,
  });

  const change = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: campaign.all }),
        client.invalidateQueries({ queryKey: ["workspaces", access.userId] }),
        client.invalidateQueries({ queryKey: accessKey }),
      ]);
    },
  });

  const denied =
    !canRead ||
    (promotion.error instanceof gateway.PromotionRequestError &&
      (promotion.error.status === 401 || promotion.error.status === 403));
  const talentAccessChanged =
    talents.error instanceof gateway.PromotionRequestError &&
    (talents.error.status === 401 || talents.error.status === 403);
  useEffect(() => {
    if (denied || talentAccessChanged)
      void client.invalidateQueries({ queryKey: accessKey });
  }, [denied, talentAccessChanged, client]);
  const state = denied
    ? "denied"
    : activities.isPending || promotion.isPending
      ? "loading"
      : activities.isError || promotion.isError
        ? "error"
        : "ready";

  return (
    <PromotionOperationsBoard
      campaignName={campaignName}
      activities={activities.data ?? []}
      promotionActivities={promotion.data ?? []}
      state={state}
      onRetry={() => {
        void activities.refetch();
        void promotion.refetch();
        if (canReadTalent) void talents.refetch();
      }}
      canManage={canManage}
      canAssignTalent={canAssignTalent}
      availableTalents={talents.data ?? []}
      talentsUnavailable={
        canAssignTalent && (!canReadTalent || !talents.isSuccess)
      }
      onAttach={
        canManage
          ? async (id, channel) => {
              await change.mutateAsync(() =>
                gateway.attachPromotion(campaignId, id, channel),
              );
            }
          : undefined
      }
      onChangeChannel={
        canManage
          ? async (id, channel) => {
              await change.mutateAsync(() =>
                gateway.changePromotionChannel(campaignId, id, channel),
              );
            }
          : undefined
      }
      onRemove={
        canManage
          ? async (id) => {
              await change.mutateAsync(() =>
                gateway.removePromotion(campaignId, id),
              );
            }
          : undefined
      }
      onAssignTalent={
        canAssignTalent && canReadTalent
          ? async (id, talentId, role) => {
              await change.mutateAsync(() =>
                gateway.assignPromotionTalent(campaignId, id, talentId, role),
              );
            }
          : undefined
      }
      onUnassignTalent={
        canAssignTalent
          ? async (id, talentId) => {
              await change.mutateAsync(() =>
                gateway.unassignPromotionTalent(campaignId, id, talentId),
              );
            }
          : undefined
      }
    />
  );
}
