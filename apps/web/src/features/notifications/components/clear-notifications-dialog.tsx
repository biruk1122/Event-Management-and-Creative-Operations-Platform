"use client";

import { LoaderCircle, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClearNotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Shown when the last attempt failed; the dialog stays open so the user can retry. */
  error: boolean;
  onConfirm: () => void;
}

/**
 * Asks before clearing the whole feed. Clearing is for the caller's own feed
 * only, so the copy says it is removed from their list and nothing else.
 */
export function ClearNotificationsDialog({
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: ClearNotificationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-destructive/10 text-destructive mb-2 inline-flex size-11 items-center justify-center rounded-xl">
            <Trash2 aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Clear notifications?</DialogTitle>
          <DialogDescription>
            Your unread notifications will be marked as read and leave the bell.
            They stay in All notifications, so nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Notifications could not be cleared</AlertTitle>
            <AlertDescription>Try again.</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Keep unread
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            {pending ? "Clearing…" : "Clear notifications"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
