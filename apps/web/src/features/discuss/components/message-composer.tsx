"use client";
import Image from "next/image";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AtSign, X, Paperclip, Send, LoaderCircle } from "lucide-react";
import {
  ACCEPTED_FILE_TYPES,
  fileSelectionError,
  formatFileSize,
} from "@/features/files/lib/file-types";
import { EmojiPicker } from "./emoji-picker";
import styles from "./discuss.module.css";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  listAssignablePeople as defaultListAssignablePeople,
  type ListAssignablePeople,
} from "../api/discuss-gateway";
import type { ScopedSendMessage as SendMessage } from "../lib/discuss-outcome";
import {
  personName,
  type DiscussPerson,
  type Message,
} from "../lib/discuss-types";

const FORM_ERRORS: Record<string, string> = {
  not_member: "You are no longer a member of this conversation.",
  user_not_found: "One of the mentioned people no longer exists.",
  parent_not_found: "The message you replied to no longer exists.",
  permission_denied: "You do not have permission to post here.",
  unexpected: "We could not send the message. Try again.",
};

interface MessageComposerProps {
  replyTarget: Message | null;
  onCancelReply: () => void;
  onSend: SendMessage;
  listAssignablePeople?: ListAssignablePeople;
  onUpload?: (messageId: string, file: File) => Promise<unknown>;
  onAttachmentsSent?: () => void;
}

export function MessageComposer({
  replyTarget,
  onCancelReply,
  onSend,
  listAssignablePeople = defaultListAssignablePeople,
  onUpload,
  onAttachmentsSent,
}: MessageComposerProps) {
  const contentId = useId();
  const mentionId = useId();
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [people, setPeople] = useState<DiscussPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const persisted = useRef<Message | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [retryAttachment, setRetryAttachment] = useState(false);
  const selection = useRef({ start: 0, end: 0 });

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function insertEmoji(emoji: string) {
    const start = textarea.current?.selectionStart ?? selection.current.start;
    const end = textarea.current?.selectionEnd ?? selection.current.end;
    const next = content.slice(0, start) + emoji + content.slice(end);
    if (next.length > 8000) return;
    setContent(next);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(
        start + emoji.length,
        start + emoji.length,
      );
    });
  }

  useEffect(() => {
    let cancelled = false;
    void listAssignablePeople().then((result) => {
      if (!cancelled) setPeople(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listAssignablePeople]);

  function addMention(personId: string) {
    if (mentionedUserIds.includes(personId)) return;
    const person = people.find((p) => p.id === personId);
    if (!person) return;
    setMentionedUserIds((current) => [...current, personId]);
    setContent((current) =>
      current.length > 0 && !current.endsWith(" ")
        ? `${current} @${personName(person)} `
        : `${current}@${personName(person)} `,
    );
  }

  function removeMention(personId: string) {
    setMentionedUserIds((current) => current.filter((id) => id !== personId));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || (!content.trim() && !file)) return;
    sending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const outcome = persisted.current
        ? { status: "success" as const, message: persisted.current }
        : await onSend({
            content: content.trim() || file!.name,
            parentMessageId: replyTarget?.id ?? null,
            mentionedUserIds,
          });
      if (outcome.status === "success") {
        if (file && onUpload) {
          persisted.current = outcome.message;
          setRetryAttachment(true);
          await onUpload(outcome.message.id, file);
          onAttachmentsSent?.();
        }
        persisted.current = null;
        setRetryAttachment(false);
        setFile(null);
        setPreview(null);
        setContent("");
        setMentionedUserIds([]);
        onCancelReply();
        textarea.current?.focus();
        return;
      }
      if (outcome.status === "field_errors") {
        setError(
          Object.values(outcome.fieldErrors)[0] ?? FORM_ERRORS.unexpected!,
        );
        return;
      }
      setError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    } catch (failure) {
      setError(
        `${persisted.current ? "Message saved; attachment not sent. Retry to attach without sending another message. " : ""}${failure instanceof Error ? failure.message : FORM_ERRORS.unexpected!}`,
      );
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      aria-label="Send a message"
      className={`${styles.composer} space-y-2`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      {replyTarget ? (
        <div className="bg-muted flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs">
          <span className="truncate">Replying to: {replyTarget.content}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {mentionedUserIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {mentionedUserIds.map((id) => {
            const person = people.find((p) => p.id === id);
            if (!person) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => removeMention(id)}
                  className="bg-accent flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                >
                  {personName(person)}
                  <X aria-hidden="true" className="size-3" />
                  <span className="sr-only">Remove mention</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Label htmlFor={contentId} className="sr-only">
        Message
      </Label>
      {file ? (
        <div className="bg-muted flex items-center gap-3 rounded-xl p-2">
          {preview ? (
            <Image
              src={preview}
              width={56}
              height={56}
              unoptimized
              alt="Selected image preview"
              className="size-14 rounded-lg object-contain"
            />
          ) : (
            <Paperclip className="size-5" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-muted-foreground text-xs">
              {formatFileSize(file.size)} · {file.type.split("/")[1]}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              retryAttachment
                ? "Discard failed attachment"
                : "Remove attachment"
            }
            disabled={submitting}
            onClick={() => {
              setFile(null);
              setPreview(null);
              if (retryAttachment) {
                persisted.current = null;
                setRetryAttachment(false);
                setContent("");
                setMentionedUserIds([]);
                setError(null);
                onCancelReply();
                textarea.current?.focus();
              }
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className={styles.composerBox}>
        <EmojiPicker
          onSelect={insertEmoji}
          disabled={submitting || retryAttachment}
        />
        <Textarea
          ref={textarea}
          id={contentId}
          required={!file}
          rows={1}
          readOnly={submitting || retryAttachment}
          maxLength={8000}
          placeholder="Write a message…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onSelect={(event) => {
            selection.current = {
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            };
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              if (!event.repeat) event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {onUpload ? (
          <>
            <input
              ref={fileInput}
              type="file"
              aria-label="Choose attachment"
              className="sr-only"
              tabIndex={-1}
              accept={ACCEPTED_FILE_TYPES.join(",")}
              disabled={submitting || retryAttachment}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                event.target.value = "";
                if (!selected) return;
                const invalid = fileSelectionError(selected);
                setError(invalid);
                if (!invalid) {
                  setFile(selected);
                  setPreview(
                    ["image/jpeg", "image/png", "image/webp"].includes(
                      selected.type,
                    )
                      ? URL.createObjectURL(selected)
                      : null,
                  );
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Attach file or image"
              disabled={submitting || retryAttachment}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip aria-hidden="true" />
            </Button>
          </>
        ) : null}
        <Button
          type="submit"
          size="icon"
          aria-label={
            submitting
              ? "Sending…"
              : retryAttachment
                ? "Retry attachment"
                : "Send"
          }
          disabled={submitting || (!content.trim() && !file)}
          aria-busy={submitting}
        >
          {submitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Send aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={mentionId} className="sr-only">
            Mention someone
          </Label>
          {/* Remounted per pick: an uncontrolled trigger would otherwise keep
              showing the last person's name instead of the "Mention" placeholder. */}
          <Select
            key={mentionedUserIds.length}
            onValueChange={addMention}
            disabled={submitting || retryAttachment}
          >
            <SelectTrigger
              id={mentionId}
              aria-label="Mention someone"
              className="h-8 w-auto"
            >
              <AtSign aria-hidden="true" className="size-3.5" />
              <SelectValue placeholder="Mention" />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {personName(person)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground text-[11px]">
          {submitting
            ? "Sending…"
            : "Enter to send · Shift + Enter for a new line"}
        </span>
      </div>
    </form>
  );
}
