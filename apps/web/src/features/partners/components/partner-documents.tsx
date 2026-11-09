"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  downloadPartnerFile,
  listPartnerFiles,
  uploadPartnerFile,
} from "../api/partners-gateway";

/**
 * A partnership's documents (EVE-233): agreements, briefs and invoices,
 * through the same managed-file pipeline as every other attachment. Anyone
 * who can read the partner can download them.
 */
export function PartnerDocuments({
  partnerId,
  canAttach,
}: {
  partnerId: string;
  canAttach: boolean;
}) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = ["partner-files", partnerId];
  const files = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listPartnerFiles(partnerId, signal),
    retry: false,
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadPartnerFile(partnerId, file),
    onSuccess: () => {
      setError(null);
      void client.invalidateQueries({ queryKey: key });
    },
    onError: () =>
      setError("The document could not be attached. Choose it again to retry."),
  });
  const download = useMutation({
    mutationFn: (fileId: string) => downloadPartnerFile(partnerId, fileId),
    onError: () => setError("The document could not be downloaded."),
  });

  return (
    <section
      aria-label="Partnership documents"
      className="border-border space-y-2 border-t pt-4"
    >
      <h3 className="text-sm font-medium">Documents</h3>
      {files.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading documents…
        </p>
      ) : files.isError ? (
        <p role="alert" className="text-sm">
          Documents could not be loaded.
        </p>
      ) : files.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {files.data.items.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0 break-all">{file.filename}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`Download ${file.filename}`}
                disabled={download.isPending}
                onClick={() => download.mutate(file.id)}
              >
                <Download aria-hidden="true" />
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canAttach ? (
        <label className="border-input hover:bg-muted/50 focus-within:ring-ring/50 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm focus-within:ring-3">
          {upload.isPending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Upload aria-hidden="true" className="size-4" />
          )}
          Add document
          <input
            type="file"
            className="sr-only"
            disabled={upload.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
