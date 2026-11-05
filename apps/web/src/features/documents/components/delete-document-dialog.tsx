"use client";

import { useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentRecord } from "../lib/documents-types";

interface DeleteDocumentDialogProps {
  document: DocumentRecord | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the document was deleted. */
  onConfirm: (document: DocumentRecord) => Promise<boolean>;
}

/** Confirms a permanent delete of one document from the list. */
export function DeleteDocumentDialog({
  document,
  onOpenChange,
  onConfirm,
}: DeleteDocumentDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(target: DocumentRecord) {
    setBusy(true);
    setError(null);
    const deleted = await onConfirm(target);
    setBusy(false);
    if (deleted) {
      onOpenChange(false);
      return;
    }
    setError("We could not delete this document. Try again.");
  }

  return (
    <Dialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this document?</DialogTitle>
          <DialogDescription>
            {document
              ? `"${document.displayName}" and its file will be removed permanently.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || document === null}
            aria-busy={busy}
            onClick={() => document && void confirm(document)}
          >
            {busy ? "Deleting…" : "Delete document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
