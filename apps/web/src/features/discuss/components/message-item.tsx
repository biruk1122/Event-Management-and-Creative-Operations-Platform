"use client";

import { useId, useState, type FormEvent } from "react";
import {
  Pencil,
  Pin,
  PinOff,
  Reply,
  Trash2,
  X,
  Check,
  CheckCheck,
} from "lucide-react";
import { ChatAvatar } from "./chat-avatar";
import { MessageAttachments } from "./message-attachments";
import styles from "./discuss.module.css";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type {
  ScopedDeleteMessage as DeleteMessage,
  ScopedEditMessage as EditMessage,
  ScopedSetPin as SetPin,
} from "../lib/discuss-outcome";
import {
  formatActivityTimestamp,
  personName,
  type Message,
} from "../lib/discuss-types";

interface MessageItemProps {
  message: Message;
  viewerId: string;
  parentPreview: string | null;
  onEdit: EditMessage;
  onDelete: DeleteMessage;
  onTogglePin: SetPin;
  onReply: (message: Message) => void;
  readLabel?: string;
  attachmentScope?: readonly unknown[];
}

export function MessageItem({
  message,
  viewerId,
  parentPreview,
  onEdit,
  onDelete,
  onTogglePin,
  onReply,
  readLabel,
  attachmentScope,
}: MessageItemProps) {
  const editId = useId();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(message.content);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isAuthor = message.author?.id === viewerId;
  const isDeleted = message.deletedAt !== null;

  async function handleEditSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await onEdit(message.id, content.trim());
    setBusy(false);
    if (outcome.status === "success") {
      setEditing(false);
      return;
    }
    setError(
      outcome.status === "not_found"
        ? "This message no longer exists."
        : "We could not save the change. Try again.",
    );
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const outcome = await onDelete(message.id);
    setBusy(false);
    if (outcome.status !== "success") {
      setError("We could not delete the message. Try again.");
    }
  }

  async function handleTogglePin() {
    setBusy(true);
    setError(null);
    const outcome = await onTogglePin(message.id, message.pinnedAt === null);
    setBusy(false);
    if (outcome.status !== "success") {
      setError("We could not update the pin. Try again.");
    }
  }

  if (isDeleted) {
    return (
      <li className="text-muted-foreground px-3 py-1 text-sm italic">
        Message deleted.
      </li>
    );
  }

  return (
    <li className={`${styles.message} ${isAuthor ? styles.outgoing : ""}`}>
      {!isAuthor ? (
        <ChatAvatar
          name={message.author ? personName(message.author) : "Deleted user"}
        />
      ) : null}
      <div className={`${styles.bubble} space-y-1`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold">
              {message.author ? personName(message.author) : "Deleted user"}
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <time dateTime={message.createdAt}>
                {formatActivityTimestamp(message.createdAt)}
              </time>
              {message.editedAt ? " · edited" : ""}
              {isAuthor ? (
                <span
                  aria-label={readLabel ?? "Sent"}
                  title={readLabel ?? "Sent"}
                >
                  {readLabel ? (
                    <CheckCheck
                      aria-hidden="true"
                      className="text-primary size-3.5"
                    />
                  ) : (
                    <Check aria-hidden="true" className="size-3.5" />
                  )}
                </span>
              ) : null}
            </span>
            {message.pinnedAt ? (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Pin aria-hidden="true" className="size-3" /> Pinned
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onReply(message)}
              aria-label="Reply"
            >
              <Reply aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void handleTogglePin()}
              aria-label={message.pinnedAt ? "Unpin message" : "Pin message"}
            >
              {message.pinnedAt ? (
                <PinOff aria-hidden="true" />
              ) : (
                <Pin aria-hidden="true" />
              )}
            </Button>
            {isAuthor ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setContent(message.content);
                    setEditing(true);
                  }}
                  aria-label="Edit message"
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                  aria-label="Delete message"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}

        {parentPreview ? (
          <p className="text-muted-foreground truncate border-l-2 pl-2 text-xs">
            Replying to: {parentPreview}
          </p>
        ) : null}

        {editing ? (
          <form
            aria-label="Edit message"
            className="space-y-2"
            onSubmit={(event) => void handleEditSubmit(event)}
          >
            <Label htmlFor={editId} className="sr-only">
              Message
            </Label>
            <Textarea
              id={editId}
              autoFocus
              required
              maxLength={8000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                <X aria-hidden="true" data-icon="inline-start" />
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
            {attachmentScope && message.attachmentCount !== 0 ? (
              <MessageAttachments
                conversationId={message.conversationId}
                messageId={message.id}
                scope={attachmentScope}
              />
            ) : null}
            {message.mentionedUsers.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                cc {message.mentionedUsers.map(personName).join(", ")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
