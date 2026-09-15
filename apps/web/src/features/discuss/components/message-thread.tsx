"use client";

import { Button } from "@/components/ui/button";

import type {
  ScopedDeleteMessage as DeleteMessage,
  ScopedEditMessage as EditMessage,
  ScopedSetPin as SetPin,
} from "../lib/discuss-outcome";
import type { Conversation, Message } from "../lib/discuss-types";
import { MessageItem } from "./message-item";

interface MessageThreadProps {
  conversation: Conversation;
  messages: Message[] | null;
  error: string | null;
  viewerId: string;
  onRetry: () => void;
  onEdit: EditMessage;
  onDelete: DeleteMessage;
  onTogglePin: SetPin;
  onReply: (message: Message) => void;
}

export function MessageThread({
  messages,
  error,
  viewerId,
  onRetry,
  onEdit,
  onDelete,
  onTogglePin,
  onReply,
}: MessageThreadProps) {
  if (error) {
    return (
      <div role="alert" className="flex-1 space-y-2">
        <p>{error}</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (messages === null) {
    return (
      <div
        role="status"
        aria-label="Loading messages"
        className="flex-1 space-y-2"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="bg-muted h-10 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="text-muted-foreground flex-1 text-sm">
        No messages yet. Say hello.
      </p>
    );
  }

  // The API returns newest first; the thread reads oldest to newest.
  const chronological = [...messages].reverse();
  const byId = new Map(messages.map((item) => [item.id, item]));

  return (
    <ul aria-label="Messages" className="flex-1 space-y-1 overflow-y-auto">
      {chronological.map((message) => {
        const parent = message.parentMessageId
          ? (byId.get(message.parentMessageId) ?? null)
          : null;
        return (
          <MessageItem
            key={message.id}
            message={message}
            viewerId={viewerId}
            parentPreview={parent ? parent.content : null}
            onEdit={onEdit}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onReply={onReply}
          />
        );
      })}
    </ul>
  );
}
