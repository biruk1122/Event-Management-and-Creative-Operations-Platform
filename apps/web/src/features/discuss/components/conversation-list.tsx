"use client";
import { ChatAvatar } from "./chat-avatar";

import {
  conversationTitle,
  formatActivityTimestamp,
  isUnread,
  type Conversation,
} from "../lib/discuss-types";

interface ConversationListProps {
  conversations: Conversation[] | null;
  viewerId: string;
  selectedId: string | null;
  kind: "dm" | "channel";
  onSelect: (id: string) => void;
  searching?: boolean;
}

export function ConversationList({
  conversations,
  viewerId,
  selectedId,
  kind,
  onSelect,
  searching,
}: ConversationListProps) {
  if (conversations === null) {
    return (
      <div
        role="status"
        aria-label="Loading conversations"
        className="space-y-2"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-muted h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {searching
          ? "No results. Try another name."
          : kind === "dm"
            ? "No conversations yet. Start one to get going."
            : "No channels yet. Create one to get going."}
      </p>
    );
  }

  return (
    <ul
      aria-label={kind === "dm" ? "Conversations" : "Channels"}
      className="space-y-1"
    >
      {conversations.map((conversation) => {
        const viewerMember = conversation.members.find(
          (m) => m.id === viewerId,
        );
        const unread =
          conversation.unreadCount !== undefined
            ? conversation.unreadCount > 0
            : viewerMember
              ? isUnread(conversation, viewerMember)
              : false;
        const selected = conversation.id === selectedId;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={selected ? "true" : undefined}
              className={`focus-visible:ring-ring flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3.5 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none ${
                selected ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <ChatAvatar
                name={conversationTitle(conversation, viewerId)}
                kind={conversation.type}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate ${unread ? "font-semibold" : "font-medium"}`}
                >
                  {conversationTitle(conversation, viewerId)}
                </span>
                <span className="text-muted-foreground mt-1 block truncate text-xs">
                  {conversation.lastMessage
                    ? conversation.lastMessage.deletedAt
                      ? "Message deleted"
                      : conversation.lastMessage.content
                    : conversation.type === "CHANNEL"
                      ? `${conversation.members.length} members`
                      : "Start a conversation"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-muted-foreground text-[10px]">
                  {formatActivityTimestamp(
                    conversation.lastMessage?.createdAt ??
                      conversation.updatedAt,
                  )}
                </span>
                {unread ? (
                  <span
                    aria-label="Unread"
                    className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium"
                  >
                    {conversation.unreadCount ?? "New"}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
