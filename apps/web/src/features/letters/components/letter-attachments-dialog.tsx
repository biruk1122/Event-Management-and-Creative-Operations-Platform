"use client";

import { useQuery } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdministrationDialogContent } from "@/components/ui/administration-dialog-content";
import { Button } from "@/components/ui/button";
import { listLetterFiles } from "../api/letters-gateway";
import type { Letter } from "../lib/letters-types";
import { LetterAttachmentList } from "./letter-attachment-list";

export function LetterAttachmentsDialog({
  letter,
  onOpenChange,
}: {
  letter: Letter | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={letter !== null} onOpenChange={onOpenChange}>
      <AdministrationDialogContent className="flex h-[98vh] max-h-[98vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-[94vw] lg:max-w-300 xl:max-w-340">
        <DialogHeader className="border-border from-accent to-card flex-row items-center justify-between gap-4 border-b bg-linear-to-br px-6 py-5 text-left sm:px-10">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <Paperclip aria-hidden="true" className="size-6" />
            </span>
            <div>
              <DialogTitle className="text-xl">Letter attachments</DialogTitle>
              <DialogDescription>
                {letter?.referenceNumber} · {letter?.subject}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          {letter ? <Attachments key={letter.id} letterId={letter.id} /> : null}
        </div>
      </AdministrationDialogContent>
    </Dialog>
  );
}

function Attachments({ letterId }: { letterId: string }) {
  const query = useQuery({
    queryKey: ["letter-attachments", letterId],
    queryFn: ({ signal }) => listLetterFiles(letterId, signal),
    retry: false,
    gcTime: 0,
  });
  if (query.isPending) return <p role="status">Loading attachments…</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!query.data.length)
    return (
      <p className="text-muted-foreground text-sm">
        No attachments yet. Open the letter to attach a file.
      </p>
    );
  return <LetterAttachmentList letterId={letterId} files={query.data} />;
}
