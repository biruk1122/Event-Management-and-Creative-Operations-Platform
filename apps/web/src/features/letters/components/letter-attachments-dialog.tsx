"use client";

import { useQuery } from "@tanstack/react-query";
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
      <AdministrationDialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Letter attachments</DialogTitle>
          <DialogDescription>
            {letter?.referenceNumber} · {letter?.subject}
          </DialogDescription>
        </DialogHeader>
        {letter ? <Attachments key={letter.id} letterId={letter.id} /> : null}
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
