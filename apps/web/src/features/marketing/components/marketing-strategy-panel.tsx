"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { campaignKeys } from "@/features/campaigns/api/campaigns-queries";
import type { Campaign } from "@/features/campaigns/lib/campaigns-types";

import * as gateway from "../api/marketing-gateway";
import { MarketingStrategyBoard } from "./marketing-strategy-board";

function hasGrant(access: CurrentAccess, key: string): boolean {
  return access.grants.some(
    (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
  );
}

export function MarketingStrategyPanel({
  campaign,
  access,
}: {
  campaign: Campaign;
  access: CurrentAccess;
}) {
  const client = useQueryClient();
  const keys = campaignKeys(access);
  const strategyKey = [
    ...keys.detail(campaign.id),
    "marketing-strategy",
  ] as const;
  const canRead = hasGrant(access, "campaign.read");
  const canManage = hasGrant(access, "campaign.update");

  const strategy = useQuery({
    queryKey: strategyKey,
    queryFn: ({ signal }) => gateway.getMarketingStrategy(campaign.id, signal),
    enabled: canRead,
    retry: false,
  });

  const reconcile = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["campaigns", access.userId] }),
      client.invalidateQueries({ queryKey: ["workspaces", access.userId] }),
      client.invalidateQueries({ queryKey: accessKey }),
    ]);
  };
  const change = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSettled: reconcile,
  });

  const accessChanged =
    strategy.error instanceof gateway.MarketingRequestError &&
    (strategy.error.status === 401 || strategy.error.status === 403);
  useEffect(() => {
    if (!canRead || accessChanged)
      void client.invalidateQueries({ queryKey: accessKey });
  }, [canRead, accessChanged, client]);

  const state =
    !canRead || accessChanged
      ? "denied"
      : strategy.isPending
        ? "loading"
        : strategy.isError
          ? "error"
          : "ready";

  return (
    <MarketingStrategyBoard
      campaign={campaign}
      strategy={strategy.data ?? null}
      state={state}
      onRetry={() => void strategy.refetch()}
      canManage={canManage}
      formatError={(cause) =>
        cause instanceof gateway.MarketingRequestError
          ? cause.message
          : "We could not save that change. Try again."
      }
      {...(canManage
        ? {
            onSave: async (text: string) => {
              await change.mutateAsync(() =>
                strategy.data
                  ? gateway.updateMarketingStrategy(campaign.id, text)
                  : gateway.createMarketingStrategy(campaign.id, text),
              );
            },
          }
        : {})}
      {...(canManage && strategy.data
        ? {
            onRemove: async () => {
              await change.mutateAsync(() =>
                gateway.removeMarketingStrategy(campaign.id),
              );
            },
          }
        : {})}
    />
  );
}
