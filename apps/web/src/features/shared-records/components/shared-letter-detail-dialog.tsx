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
import {
  formatFileSize,
  type EventFile,
} from "@/features/files/lib/file-types";
import {
  letterPartyLabel,
  LETTER_CATEGORY_LABELS,
} from "@/features/letters/lib/letters-types";

import {
  downloadSharedLetterFile,
  getSharedLetter,
  listSharedLetterFiles,
} from "../api/shared-records-gateway";
import { canDownloadShared } from "../lib/shared-records-types";
import type { SharedLetter } from "../lib/shared-records-types";

interface SharedLetterDetailDialogProps {
  letterId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function SharedLetterDetailDialog({
  letterId,
  onOpenChange,
}: SharedLetterDetailDialogProps) {
  return (
    <Dialog
      open={letterId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {letterId !== null ? (
          <SharedLetterDetailBody key={letterId} letterId={letterId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SharedLetterDetailBody({ letterId }: { letterId: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [letter, setLetter] = useState<SharedLetter | null>(null);
  const [files, setFiles] = useState<EventFile[]>([]);
  const [filesStatus, setFilesStatus] = useState<
    "loading" | "loaded" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    void getSharedLetter(letterId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setLetter(loaded);
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    void listSharedLetterFiles(letterId)
      .then((loaded) => {
        if (!cancelled) {
          setFiles(loaded);
          setFilesStatus("loaded");
        }
      })
      .catch(() => {
        if (!cancelled) setFilesStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [letterId]);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading letter…
      </div>
    );
  }

  if (status === "error" || !letter) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>This is no longer shared with you</AlertTitle>
        <AlertDescription>Close this and refresh the list.</AlertDescription>
      </Alert>
    );
  }

  const canDownload = canDownloadShared(letter);

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{letter.referenceNumber}</DialogTitle>
          <Badge variant="outline">
            {LETTER_CATEGORY_LABELS[letter.category]}
          </Badge>
        </div>
        <DialogDescription>
          {letter.subject}
          {letter.projectName ? ` · ${letter.projectName}` : ""}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Date</dt>
          <dd className="mt-1">{letter.date}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{letterPartyLabel(letter)}</dt>
          <dd className="mt-1">
            {letter.direction === "INCOMING"
              ? letter.fromParty
              : letter.toParty}
          </dd>
        </div>
        {letter.senderReferenceNumber ? (
          <div>
            <dt className="text-muted-foreground">
              Sender&apos;s reference no.
            </dt>
            <dd className="mt-1">{letter.senderReferenceNumber}</dd>
          </div>
        ) : null}
      </dl>

      {letter.shortDescription ? (
        <div className="text-sm">
          <p className="text-muted-foreground">Short description</p>
          <p className="mt-1">{letter.shortDescription}</p>
        </div>
      ) : null}

      <div className="border-border space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Attachments</p>
        {filesStatus === "loading" ? (
          <p className="text-muted-foreground text-sm">Loading attachments…</p>
        ) : filesStatus === "error" ? (
          <p className="text-destructive text-sm">
            We could not load attachments.
          </p>
        ) : files.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attachments.</p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-2 p-3"
              >
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  title={file.filename}
                >
                  {file.filename}{" "}
                  <span className="text-muted-foreground">
                    ({formatFileSize(file.sizeBytes)})
                  </span>
                </span>
                {canDownload ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void downloadSharedLetterFile(letterId, file.id)
                    }
                  >
                    Download
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!canDownload && files.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            You can view this letter&apos;s attachments but not download them.
          </p>
        ) : null}
      </div>
    </>
  );
}
