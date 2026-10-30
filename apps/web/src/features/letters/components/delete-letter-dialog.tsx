"use client";

import { useState } from "react";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdministrationDialogContent } from "@/components/ui/administration-dialog-content";
import { Button } from "@/components/ui/button";
import type { Letter } from "../lib/letters-types";
import type { DeleteLetter } from "../lib/letters-outcome";

export function DeleteLetterDialog({
  letter,
  onOpenChange,
  onDelete,
  onDeleted,
}: {
  letter: Letter | null;
  onOpenChange: (open: boolean) => void;
  onDelete: DeleteLetter;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={letter !== null} onOpenChange={onOpenChange}>
      <AdministrationDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete letter?</DialogTitle>
          <DialogDescription>
            Remove {letter?.referenceNumber} from the letters register? This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {letter ? (
          <DeleteConfirmation
            key={letter.id}
            letter={letter}
            onCancel={() => onOpenChange(false)}
            onDelete={onDelete}
            onDeleted={onDeleted}
          />
        ) : null}
      </AdministrationDialogContent>
    </Dialog>
  );
}

function DeleteConfirmation({
  letter,
  onCancel,
  onDelete,
  onDeleted,
}: {
  letter: Letter;
  onCancel: () => void;
  onDelete: DeleteLetter;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await onDelete(letter.id);
      if (outcome.status === "success") {
        onDeleted();
        return;
      }
      setError(
        outcome.status === "permission_denied"
          ? "You do not have permission to delete this letter."
          : outcome.status === "not_found"
            ? "This letter no longer exists. Refresh the list."
            : "We could not delete this letter. Try again.",
      );
    } catch {
      setError("We could not delete this letter. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium break-words">{letter.subject}</p>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Deleting…" : "Delete letter"}
        </Button>
      </div>
    </div>
  );
}
