"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import * as gateway from "./discuss-gateway";
import type { ChannelVisibility } from "../lib/discuss-types";

/** Query keys namespaced by the acting user and a signature of their grants,
 * so a permission change never serves cache written under the old
 * authority. Separate `dm`/`channel` scopes since the two screens filter
 * independently. */
export function discussKeys(access: CurrentAccess, kind: "dm" | "channel") {
  const scope = [
    ...new Set(
      access.grants.map((grant) => `${grant.permissionKey}:${grant.scope}`),
    ),
  ]
    .sort()
    .join(",");
  const all = ["discuss", kind, access.userId, scope] as const;
  return {
    all,
    list: (params: Record<string, unknown>) =>
      [...all, "list", params] as const,
    messages: (conversationId: string, params: Record<string, unknown>) =>
      [...all, "messages", conversationId, params] as const,
    assignablePeople: [...all, "assignable-people"] as const,
    channelOwners: [...all, "channel-owners"] as const,
  };
}

export function useDiscussMutations(
  access: CurrentAccess,
  kind: "dm" | "channel",
) {
  const client = useQueryClient();
  const reconcile = async () => {
    await client.invalidateQueries({
      queryKey: ["discuss", kind, access.userId],
    });
    await client.invalidateQueries({ queryKey: accessKey });
  };

  return {
    startConversation: useMutation({
      mutationFn: gateway.startConversation,
      onSettled: reconcile,
    }),
    createChannel: useMutation({
      mutationFn: gateway.createChannel,
      onSettled: reconcile,
    }),
    updateChannel: useMutation({
      mutationFn: ({
        conversationId,
        values,
      }: {
        conversationId: string;
        values: { name?: string; visibility?: ChannelVisibility };
      }) => gateway.updateChannel(conversationId, values),
      onSettled: reconcile,
    }),
    addMember: useMutation({
      mutationFn: ({
        conversationId,
        userId,
      }: {
        conversationId: string;
        userId: string;
      }) => gateway.addMember(conversationId, userId),
      onSettled: reconcile,
    }),
    removeMember: useMutation({
      mutationFn: ({
        conversationId,
        userId,
      }: {
        conversationId: string;
        userId: string;
      }) => gateway.removeMember(conversationId, userId),
      onSettled: reconcile,
    }),
    sendMessage: useMutation({
      mutationFn: ({
        conversationId,
        values,
      }: {
        conversationId: string;
        values: Parameters<typeof gateway.sendMessage>[1];
      }) => gateway.sendMessage(conversationId, values),
      onSettled: reconcile,
    }),
    editMessage: useMutation({
      mutationFn: ({
        conversationId,
        messageId,
        content,
      }: {
        conversationId: string;
        messageId: string;
        content: string;
      }) => gateway.editMessage(conversationId, messageId, content),
      onSettled: reconcile,
    }),
    deleteMessage: useMutation({
      mutationFn: ({
        conversationId,
        messageId,
      }: {
        conversationId: string;
        messageId: string;
      }) => gateway.deleteMessage(conversationId, messageId),
      onSettled: reconcile,
    }),
    setPin: useMutation({
      mutationFn: ({
        conversationId,
        messageId,
        pinned,
      }: {
        conversationId: string;
        messageId: string;
        pinned: boolean;
      }) => gateway.setPin(conversationId, messageId, pinned),
      onSettled: reconcile,
    }),
    updateReadCursor: useMutation({
      mutationFn: ({
        conversationId,
        messageId,
      }: {
        conversationId: string;
        messageId: string;
      }) => gateway.updateReadCursor(conversationId, messageId),
      // Without this, the list's unread badge never clears - not even for a
      // conversation where the viewer just sent the last message themselves.
      onSettled: reconcile,
    }),
  };
}
