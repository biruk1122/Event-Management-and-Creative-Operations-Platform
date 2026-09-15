"use client";

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
}

export function ConversationList({
  conversations,
  viewerId,
  selectedId,
  kind,
  onSelect,
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
        {kind === "dm"
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
        const unread = viewerMember
          ? isUnread(conversation, viewerMember)
          : false;
        const selected = conversation.id === selectedId;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={selected ? "true" : undefined}
              className={`focus-visible:ring-ring flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:ring-3 focus-visible:outline-none ${
                selected ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {unread ? (
                  <span
                    aria-label="Unread"
                    className="bg-primary size-2 shrink-0 rounded-full"
                  />
                ) : null}
                <span className={`truncate ${unread ? "font-semibold" : ""}`}>
                  {conversationTitle(conversation, viewerId)}
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatActivityTimestamp(conversation.updatedAt)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
