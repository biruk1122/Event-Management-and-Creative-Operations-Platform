"use client";
import { useEffect, useRef } from "react";
import styles from "./discuss.module.css";

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
  attachmentScope?: readonly unknown[];
  onReadLatest?: (id: string) => void;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

export function MessageThread({
  conversation,
  messages,
  error,
  viewerId,
  onRetry,
  onEdit,
  onDelete,
  onTogglePin,
  onReply,
  attachmentScope,
  onReadLatest,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: MessageThreadProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const hasMessages = Boolean(messages?.length);
  const atBottom = useRef(true);
  const previous = useRef({
    conversationId: "",
    count: 0,
    height: 0,
    latest: "",
  });
  const newest = messages?.[0]?.id;
  useEffect(() => {
    if (!list.current) return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current && viewport.current)
        viewport.current.scrollTop = viewport.current.scrollHeight;
    });
    observer.observe(list.current);
    return () => observer.disconnect();
  }, [conversation.id, hasMessages, error]);
  useEffect(() => {
    const el = viewport.current;
    if (!el || !messages) return;
    const old = previous.current;
    if (
      old.conversationId !== conversation.id ||
      (old.latest !== newest && atBottom.current)
    ) {
      atBottom.current = true;
      el.scrollTop = el.scrollHeight;
    } else if (old.latest === newest && messages.length > old.count)
      el.scrollTop += el.scrollHeight - old.height;
    previous.current = {
      conversationId: conversation.id,
      count: messages.length,
      height: el.scrollHeight,
      latest: newest ?? "",
    };
  }, [conversation.id, messages, newest]);
  useEffect(() => {
    const mark = () => {
      if (
        newest &&
        atBottom.current &&
        document.visibilityState === "visible" &&
        document.hasFocus()
      )
        onReadLatest?.(newest);
    };
    mark();
    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", mark);
    return () => {
      window.removeEventListener("focus", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [newest, onReadLatest]);
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
    <div
      ref={viewport}
      className={styles.history}
      onScroll={(event) => {
        const el = event.currentTarget;
        atBottom.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        previous.current.height = el.scrollHeight;
        if (
          atBottom.current &&
          newest &&
          document.hasFocus() &&
          document.visibilityState === "visible"
        )
          onReadLatest?.(newest);
      }}
    >
      {hasOlder ? (
        <div className="mb-5 text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingOlder}
            onClick={() => {
              if (viewport.current)
                previous.current.height = viewport.current.scrollHeight;
              onLoadOlder?.();
            }}
          >
            {loadingOlder ? "Loading…" : "Load older messages"}
          </Button>
        </div>
      ) : null}
      <ul ref={list} aria-label="Messages" className={styles.messages}>
        {chronological.map((message) => {
          const parent = message.parentMessageId
            ? (byId.get(message.parentMessageId) ?? null)
            : null;
          const index = chronological.findIndex(
            (item) => item.id === message.id,
          );
          const readers = conversation.members.filter(
            (member) =>
              member.id !== viewerId &&
              member.lastReadMessageId &&
              chronological.findIndex(
                (item) => item.id === member.lastReadMessageId,
              ) >= index,
          );
          const readLabel = readers.length
            ? conversation.type === "DIRECT"
              ? "Read"
              : `Read by ${readers.length} ${readers.length === 1 ? "member" : "members"}`
            : undefined;
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
              {...(readLabel ? { readLabel } : {})}
              {...(attachmentScope ? { attachmentScope } : {})}
            />
          );
        })}
      </ul>
    </div>
  );
}
