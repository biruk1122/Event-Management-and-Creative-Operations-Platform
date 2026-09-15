"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { AtSign, X } from "lucide-react";

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

import { listAssignablePeople as defaultListAssignablePeople } from "../api/list-assignable-people";
import type { ScopedSendMessage as SendMessage } from "../lib/discuss-outcome";
import {
  personName,
  type DiscussPerson,
  type Message,
} from "../lib/discuss-types";
import type { ListAssignablePeople } from "../api/list-assignable-people";

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
}

export function MessageComposer({
  replyTarget,
  onCancelReply,
  onSend,
  listAssignablePeople = defaultListAssignablePeople,
}: MessageComposerProps) {
  const contentId = useId();
  const mentionId = useId();
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [people, setPeople] = useState<DiscussPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (content.trim() === "") return;
    setSubmitting(true);
    setError(null);
    const outcome = await onSend({
      content: content.trim(),
      parentMessageId: replyTarget?.id ?? null,
      mentionedUserIds,
    });
    setSubmitting(false);
    if (outcome.status === "success") {
      setContent("");
      setMentionedUserIds([]);
      onCancelReply();
      return;
    }
    if (outcome.status === "field_errors") {
      setError(
        Object.values(outcome.fieldErrors)[0] ?? FORM_ERRORS.unexpected!,
      );
      return;
    }
    setError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  return (
    <form
      aria-label="Send a message"
      className="space-y-2 border-t pt-3"
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
      <Textarea
        id={contentId}
        required
        maxLength={8000}
        placeholder="Write a message…"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={mentionId} className="sr-only">
            Mention someone
          </Label>
          {/* Remounted per pick: an uncontrolled trigger would otherwise keep
              showing the last person's name instead of the "Mention" placeholder. */}
          <Select key={mentionedUserIds.length} onValueChange={addMention}>
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
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
