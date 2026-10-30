"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatFileSize,
  type EventFile,
} from "@/features/files/lib/file-types";
import { downloadLetterFile, getLetterFileUrl } from "../api/letters-gateway";

export function LetterAttachmentList({
  letterId,
  files,
}: {
  letterId: string;
  files: readonly EventFile[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    file: EventFile;
    url: string;
    text: string | undefined;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function act(file: EventFile, view: boolean) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(file.id);
    setError(null);
    try {
      if (!view) {
        await downloadLetterFile(letterId, file.id);
        return;
      }
      const url = await getLetterFileUrl(letterId, file.id);
      if (controller.signal.aborted) return;
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("We could not open this attachment. Try again.");
      const blob = new Blob([await response.arrayBuffer()], {
        type: file.mediaType,
      });
      const text = file.mediaType.startsWith("text/")
        ? await blob.text()
        : undefined;
      if (controller.signal.aborted) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setPreview({ file, url: objectUrl.current, text });
    } catch (caught) {
      if (!controller.signal.aborted)
        setError(
          caught instanceof Error
            ? caught.message
            : "File unavailable. Try again.",
        );
    } finally {
      if (request.current === controller && !controller.signal.aborted)
        setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <ul className="divide-border divide-y rounded-lg border">
        {files.map((file) => {
          const viewable =
            file.mediaType === "application/pdf" ||
            file.mediaType.startsWith("image/") ||
            file.mediaType.startsWith("text/");
          return (
            <li key={file.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1 basis-40">
                <p className="text-sm font-medium break-all">{file.filename}</p>
                <p className="text-muted-foreground text-xs">
                  {formatFileSize(file.sizeBytes)}
                  {!viewable ? " · Download to open in Office" : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null || !viewable}
                  aria-label={`View ${file.filename}`}
                  onClick={() => void act(file, true)}
                >
                  <Eye aria-hidden="true" />
                  View
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Download ${file.filename}`}
                  onClick={() => void act(file, false)}
                >
                  <Download aria-hidden="true" />
                  Download
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {busy ? (
        <p role="status" className="text-muted-foreground text-sm">
          Opening attachment…
        </p>
      ) : null}
      {preview ? (
        <section
          aria-label={`Preview of ${preview.file.filename}`}
          className="space-y-2 rounded-lg border p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 text-sm font-medium break-all">
              {preview.file.filename}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
                objectUrl.current = null;
              }}
            >
              Close preview
            </Button>
          </div>
          {preview.text !== undefined ? (
            <pre className="max-h-96 overflow-auto text-sm break-all whitespace-pre-wrap">
              {preview.text}
            </pre>
          ) : preview.file.mediaType.startsWith("image/") ? (
            <Image
              unoptimized
              src={preview.url}
              alt={preview.file.filename}
              width={1000}
              height={700}
              className="max-h-96 w-full object-contain"
            />
          ) : (
            <iframe
              title={`Preview of ${preview.file.filename}`}
              src={preview.url}
              className="h-96 w-full rounded border"
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
