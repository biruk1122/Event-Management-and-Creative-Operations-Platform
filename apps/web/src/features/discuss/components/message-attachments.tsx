"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/features/files/lib/file-types";
import {
  listMessageFiles,
  messageFileGrant,
  type MessageFile,
} from "../api/message-files-gateway";

function Attachment({
  file,
  conversationId,
  messageId,
}: {
  file: MessageFile;
  conversationId: string;
  messageId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const image = ["image/jpeg", "image/png", "image/webp"].includes(
    file.mediaType,
  );
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    const abort = new AbortController();
    void (async () => {
      try {
        const grant = await messageFileGrant(
          conversationId,
          messageId,
          file.id,
        );
        const result = await fetch(grant.url, {
          signal: abort.signal,
          cache: "no-store",
        });
        if (!result.ok)
          throw new Error("Image unavailable. Try downloading it again.");
        const blob = await result.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled)
          setError("Image preview unavailable. Use Download to retry.");
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, messageId, file.id, image]);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const grant = await messageFileGrant(conversationId, messageId, file.id);
      window.location.assign(grant.url);
    } catch {
      setError("Download unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-background/70 mt-2 overflow-hidden rounded-xl border">
      {image && url ? (
        <button
          type="button"
          className="block w-full"
          aria-label={`Preview ${file.filename}`}
          onClick={() => setOpen(true)}
        >
          <Image
            src={url}
            width={800}
            height={600}
            unoptimized
            alt={file.filename}
            className="max-h-72 w-full object-contain"
          />
        </button>
      ) : null}
      <div className="flex items-center gap-3 p-3">
        <span className="text-primary bg-accent rounded-xl p-2">
          {image ? (
            <ImageIcon aria-hidden="true" className="size-5" />
          ) : (
            <FileText aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.filename}>
            {file.filename}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatFileSize(file.sizeBytes)} ·{" "}
            {file.mediaType
              .split("/")[1]
              ?.replace("vnd.openxmlformats-officedocument.", "")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Download ${file.filename}`}
          disabled={busy}
          onClick={() => void download()}
        >
          <Download aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive px-3 pb-2 text-xs">
          {error}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle className="pr-6 break-all">{file.filename}</DialogTitle>
          <DialogDescription>
            Original image · {formatFileSize(file.sizeBytes)}
          </DialogDescription>
          {url ? (
            <Image
              src={url}
              width={1600}
              height={1200}
              unoptimized
              alt={file.filename}
              className="max-h-[65svh] w-full object-contain"
            />
          ) : null}
          <Button onClick={() => void download()} disabled={busy}>
            <Download aria-hidden="true" />
            Download original
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function MessageAttachments({
  conversationId,
  messageId,
  scope,
}: {
  conversationId: string;
  messageId: string;
  scope: readonly unknown[];
}) {
  const query = useQuery({
    queryKey: [...scope, "files", conversationId, messageId],
    queryFn: ({ signal }) =>
      listMessageFiles(conversationId, messageId, signal),
    retry: false,
    staleTime: 30_000,
  });
  if (query.isPending)
    return (
      <p role="status" className="text-muted-foreground mt-1 text-xs">
        Loading attachments…
      </p>
    );
  if (query.isError)
    return (
      <button
        type="button"
        className="text-destructive text-xs underline"
        onClick={() => void query.refetch()}
      >
        Retry loading attachments
      </button>
    );
  return query.data.map((file) => (
    <Attachment
      key={file.id}
      file={file}
      conversationId={conversationId}
      messageId={messageId}
    />
  ));
}
