"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WorkDialogContent } from "@/components/ui/work-dialog-content";

export function RemoveMeetingDialog({
  title,
  onRemove,
}: {
  title: string;
  onRemove: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  async function remove() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await onRemove();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove the meeting. Try again.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting.current) return;
        setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button ref={trigger} variant="outline" size="sm">
          <Trash2 aria-hidden="true" />
          Remove meeting
        </Button>
      </DialogTrigger>
      <WorkDialogContent
        showCloseButton={!pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButton.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!trigger.current?.isConnected) {
            event.preventDefault();
            document
              .querySelector<HTMLElement>(
                "[data-meeting-item], [data-meeting-create], #meeting-list-title",
              )
              ?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Remove this meeting?</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            This permanently deletes “{title}” for everyone, including its
            calendar entries and invitations. Action-item tasks will be kept.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            ref={cancelButton}
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep meeting
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void remove()}
          >
            {pending ? "Removing…" : "Yes, remove meeting"}
          </Button>
        </DialogFooter>
      </WorkDialogContent>
    </Dialog>
  );
}
