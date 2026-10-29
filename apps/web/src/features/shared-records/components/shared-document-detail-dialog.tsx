"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { formatFileSize } from "@/features/files/lib/file-types";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/lib/documents-types";

import {
  downloadSharedDocumentFile,
  getSharedDocument,
} from "../api/shared-records-gateway";
import { canDownloadShared } from "../lib/shared-records-types";
import type { SharedDocument } from "../lib/shared-records-types";

interface SharedDocumentDetailDialogProps {
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function SharedDocumentDetailDialog({
  documentId,
  onOpenChange,
}: SharedDocumentDetailDialogProps) {
  return (
    <Dialog
      open={documentId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {documentId !== null ? (
          <SharedDocumentDetailBody key={documentId} documentId={documentId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SharedDocumentDetailBody({ documentId }: { documentId: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [document, setDocument] = useState<SharedDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSharedDocument(documentId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setDocument(loaded);
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading document…
      </div>
    );
  }

  if (status === "error" || !document) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>This is no longer shared with you</AlertTitle>
        <AlertDescription>Close this and refresh the list.</AlertDescription>
      </Alert>
    );
  }

  const canDownload = canDownloadShared(document);

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{document.displayName}</DialogTitle>
          <Badge variant="outline">
            {DOCUMENT_TYPE_LABELS[document.documentType]}
          </Badge>
        </div>
        <DialogDescription>
          {document.sourceLetterReferenceNumber
            ? `From letter ${document.sourceLetterReferenceNumber}`
            : (document.projectName ?? "Standalone document")}
        </DialogDescription>
      </DialogHeader>

      {document.description ? (
        <div className="text-sm">
          <p className="text-muted-foreground">Description</p>
          <p className="mt-1">{document.description}</p>
        </div>
      ) : null}

      <div className="border-border space-y-3 border-t pt-4">
        <p className="text-sm font-medium">File</p>
        {document.fileAvailable && document.originalFilename ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <span className="min-w-0 flex-1 truncate text-sm">
              {document.originalFilename}{" "}
              {document.sizeBytes !== null ? (
                <span className="text-muted-foreground">
                  ({formatFileSize(document.sizeBytes)})
                </span>
              ) : null}
            </span>
            {canDownload ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void downloadSharedDocumentFile(documentId)}
              >
                Download
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">View only</span>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No file attached.</p>
        )}
      </div>
    </>
  );
}
