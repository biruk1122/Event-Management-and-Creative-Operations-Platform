"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ListAssignablePeople } from "../api/list-assignable-people";
import type {
  AddMember,
  RemoveMember,
  ScopedUpdateChannel,
} from "../lib/discuss-outcome";
import {
  personName,
  type ChannelVisibility,
  type Conversation,
  type DiscussPerson,
} from "../lib/discuss-types";

interface ConversationMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  listAssignablePeople: ListAssignablePeople;
  onAddMember: AddMember;
  onRemoveMember: RemoveMember;
  onUpdateChannel: ScopedUpdateChannel;
  onChanged: (conversation: Conversation) => void;
}

export function ConversationMembersDialog({
  open,
  onOpenChange,
  conversation,
  listAssignablePeople,
  onAddMember,
  onRemoveMember,
  onUpdateChannel,
  onChanged,
}: ConversationMembersDialogProps) {
  const addId = useId();
  const nameId = useId();
  const [people, setPeople] = useState<DiscussPerson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState(conversation.name ?? "");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listAssignablePeople().then((result) => {
      setPeople(result);
      setError(null);
    });
  }, [open, listAssignablePeople]);

  const memberIds = new Set(conversation.members.map((member) => member.id));
  const candidates = people.filter((person) => !memberIds.has(person.id));

  async function handleAdd(userId: string) {
    setBusyId(userId);
    setError(null);
    const outcome = await onAddMember(conversation.id, userId);
    setBusyId(null);
    if (outcome.status === "success") {
      onChanged(outcome.conversation);
      return;
    }
    setError(
      outcome.status === "user_not_found"
        ? "That person no longer exists."
        : "We could not add that person. Try again.",
    );
  }

  async function handleRemove(userId: string) {
    setBusyId(userId);
    setError(null);
    const outcome = await onRemoveMember(conversation.id, userId);
    setBusyId(null);
    if (outcome.status === "success") {
      onChanged(outcome.conversation);
      return;
    }
    setError("We could not remove that person. Try again.");
  }

  async function handleRenameSubmit(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    setError(null);
    const outcome = await onUpdateChannel({ name: name.trim() });
    setSavingName(false);
    if (outcome.status === "success") {
      onChanged(outcome.conversation);
      return;
    }
    setError("We could not rename the channel. Try again.");
  }

  async function handleVisibilityChange(visibility: ChannelVisibility) {
    setError(null);
    const outcome = await onUpdateChannel({ visibility });
    if (outcome.status === "success") {
      onChanged(outcome.conversation);
      return;
    }
    setError("We could not change the visibility. Try again.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>
            {conversation.type === "CHANNEL"
              ? "Anyone here can see and post in this channel."
              : "Everyone in this group can see and post here."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        {conversation.type === "CHANNEL" ? (
          <div className="space-y-3 border-b pb-3">
            <form
              aria-label="Rename channel"
              className="flex items-end gap-2"
              onSubmit={(event) => void handleRenameSubmit(event)}
            >
              <div className="flex-1 space-y-1">
                <Label htmlFor={nameId}>Name</Label>
                <Input
                  id={nameId}
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={savingName || name.trim() === conversation.name}
                aria-busy={savingName}
              >
                {savingName ? "Saving…" : "Save"}
              </Button>
            </form>

            <div className="space-y-1">
              <Label htmlFor={`${nameId}-visibility`}>Visibility</Label>
              <Select
                {...(conversation.visibility
                  ? { value: conversation.visibility }
                  : {})}
                onValueChange={(value) =>
                  void handleVisibilityChange(value as ChannelVisibility)
                }
              >
                <SelectTrigger id={`${nameId}-visibility`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">
                    Public - anyone can join
                  </SelectItem>
                  <SelectItem value="PRIVATE">
                    Private - membership by invitation
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        <ul
          aria-label="Current members"
          className="max-h-56 space-y-1 overflow-y-auto"
        >
          {conversation.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{personName(member)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyId === member.id}
                onClick={() => void handleRemove(member.id)}
                aria-label={`Remove ${personName(member)}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <Label htmlFor={addId}>Add someone</Label>
          <Select
            onValueChange={(value) => void handleAdd(value)}
            disabled={candidates.length === 0}
          >
            <SelectTrigger id={addId}>
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {personName(person)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
    </Dialog>
  );
}
