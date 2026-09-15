"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import type { ListAssignablePeople } from "../api/discuss-gateway";
import type { StartConversation } from "../lib/discuss-outcome";
import {
  personName,
  type Conversation,
  type ConversationType,
  type DiscussPerson,
} from "../lib/discuss-types";

const FORM_ERRORS: Record<string, string> = {
  user_not_found: "One of the selected people no longer exists.",
  permission_denied: "You do not have permission to start a conversation.",
  unexpected: "We could not start the conversation. Try again.",
};

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listAssignablePeople: ListAssignablePeople;
  onStart: StartConversation;
  onStarted: (conversation: Conversation) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  listAssignablePeople,
  onStart,
  onStarted,
}: NewConversationDialogProps) {
  const [type, setType] =
    useState<Extract<ConversationType, "DIRECT" | "GROUP">>("DIRECT");
  const [people, setPeople] = useState<DiscussPerson[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listAssignablePeople().then(setPeople);
  }, [open, listAssignablePeople]);

  function reset() {
    setType("DIRECT");
    setMemberIds([]);
    setFormError(null);
  }

  function toggleMember(id: string, checked: boolean) {
    setMemberIds((current) => {
      if (checked) {
        return type === "DIRECT" ? [id] : [...current, id];
      }
      return current.filter((memberId) => memberId !== id);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (type === "DIRECT" && memberIds.length !== 1) {
      setFormError("Choose exactly one person for a direct message.");
      return;
    }
    if (memberIds.length === 0) {
      setFormError("Choose at least one person.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const outcome = await onStart({ type, memberIds });
    setSubmitting(false);

    if (outcome.status === "success") {
      onStarted(outcome.conversation);
      reset();
      onOpenChange(false);
      return;
    }
    if (outcome.status === "field_errors") {
      setFormError(
        Object.values(outcome.fieldErrors)[0] ?? FORM_ERRORS.unexpected!,
      );
      return;
    }
    setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Start a direct message with one person, or a group with several.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Start a conversation"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div
            role="radiogroup"
            aria-label="Conversation type"
            className="flex gap-2"
          >
            {(["DIRECT", "GROUP"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={type === option ? "default" : "outline"}
                role="radio"
                aria-checked={type === option}
                onClick={() => {
                  setType(option);
                  setMemberIds([]);
                }}
              >
                {option === "DIRECT" ? "Direct message" : "Group"}
              </Button>
            ))}
          </div>

          <fieldset className="max-h-64 space-y-2 overflow-y-auto">
            <legend className="mb-1 text-sm font-medium">
              {type === "DIRECT" ? "Person" : "People"}
            </legend>
            {people.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No people available.
              </p>
            ) : (
              people.map((person) => {
                const checkboxId = `member-${person.id}`;
                return (
                  <div key={person.id} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={memberIds.includes(person.id)}
                      onCheckedChange={(checked) =>
                        toggleMember(person.id, checked === true)
                      }
                    />
                    <Label htmlFor={checkboxId} className="font-normal">
                      {personName(person)}
                    </Label>
                  </div>
                );
              })
            )}
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
