"use client";

import { useId, useState } from "react";
import {
  Download,
  LoaderCircle,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import {
  ACCEPTED_FILE_TYPES,
  fileSelectionError,
  formatFileSize,
  type EventFile,
} from "../lib/file-types";

/** One page of attached files, as the panel reads it. */
export type ManagedFilesPage = {
  items: readonly unknown[];
  pageSize: number;
  total: number;
};

/** The subset of a query result the panel needs to render a page of files. */
export type ManagedFilesQuery = {
  data?: ManagedFilesPage;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

/** The subset of the mutations the panel needs to change files. */
export type ManagedFilesActions = {
  upload: {
    mutateAsync: (file: File) => Promise<EventFile>;
    isPending: boolean;
  };
  remove: {
    mutateAsync: (fileId: string) => Promise<unknown>;
    isPending: boolean;
  };
  download: {
    mutateAsync: (fileId: string) => Promise<unknown>;
    isPending: boolean;
  };
};

export type ManagedFilesPanelProps = {
  /** What the files belong to, used in the copy: "event" or "campaign". */
  noun: "event" | "campaign";
  canRead: boolean;
  canUpdate: boolean;
  /** The page of files being read, from the owner's query. */
  query: ManagedFilesQuery;
  /** Upload, remove and download for the same parent. */
  actions: ManagedFilesActions;
  /** The page shown, and how to move between pages. */
  page: number;
  onPageChange: (page: number) => void;
};

export function ManagedFilesPanel({
  noun,
  canRead,
  canUpdate,
  query,
  actions,
  page,
  onPageChange,
}: ManagedFilesPanelProps) {
  const id = useId();
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const mutations = actions;
  const files = (query.data?.items ?? []) as EventFile[];
  const queryError = query.error instanceof Error ? query.error.message : null;
  const displayedError = error ?? (query.isError ? queryError : null);
  const busy =
    mutations.upload.isPending ||
    mutations.remove.isPending ||
    mutations.download.isPending;

  if (!canRead)
    return (
      <section className="border-border space-y-2 border-t pt-4">
        <h2 className="font-medium">Files</h2>
        <p role="alert" className="text-muted-foreground text-sm">
          You do not have permission to view files for this {noun}.
        </p>
      </section>
    );

  const choose = (file: File | null) => {
    setSelected(null);
    setError(null);
    if (!file) return;
    const invalid = fileSelectionError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSelected(file);
  };

  const upload = async () => {
    if (!selected) return;
    setError(null);
    try {
      const next = await mutations.upload.mutateAsync(selected);
      setSelected(null);
      setNotice(`${next.filename} is ready to download.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not attach that file. Your selection is still available to retry.",
      );
    }
  };

  const remove = async (file: EventFile) => {
    try {
      await mutations.remove.mutateAsync(file.id);
      if (files.length === 1 && page > 1) onPageChange(page - 1);
      setNotice(`${file.filename} was removed.`);
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "We could not remove that file. Try again.",
      );
    }
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="border-border space-y-3 border-t pt-4"
    >
      <div>
        <h2 id={`${id}-title`} className="font-medium">
          Files
        </h2>
        <p className="text-muted-foreground text-sm">
          Private attachments are checked before they become available.
        </p>
      </div>

      {displayedError ? (
        <Alert variant="destructive">
          <AlertTitle>File action needs attention</AlertTitle>
          <AlertDescription>
            {displayedError}{" "}
            {query.isError ? (
              <Button
                type="button"
                variant="link"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {query.isPending ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Loading files...
        </p>
      ) : query.isError ? null : files.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No files are attached to this {noun} yet.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p data-file-name className="text-sm font-medium">
                  {file.filename}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatFileSize(file.sizeBytes)} · Available
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void mutations.download
                      .mutateAsync(file.id)
                      .then(() =>
                        setNotice(
                          `Your download for ${file.filename} is ready.`,
                        ),
                      )
                      .catch((downloadError) =>
                        setError(
                          downloadError instanceof Error
                            ? downloadError.message
                            : "We could not prepare that download. Try again.",
                        ),
                      )
                  }
                >
                  <Download />
                  Download
                </Button>
                {canUpdate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${file.filename}`}
                    onClick={() => void remove(file)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpdate ? (
        <div data-file-upload className="space-y-3">
          <AttachmentDropzone
            inputLabel="Add a file"
            disabled={busy}
            accept={ACCEPTED_FILE_TYPES.join(",")}
            multiple={false}
            hint="PDF, images, text, CSV, or Office documents up to 100 MB."
            onFiles={(files) => choose(files[0] ?? null)}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              disabled={!selected || busy}
              aria-busy={busy}
              onClick={() => void upload()}
            >
              <Upload />
              {busy ? "Checking..." : "Attach file"}
            </Button>
          </div>
          {selected ? (
            <p className="mt-2 text-sm">
              <Paperclip className="mr-1 inline size-4" />
              {selected.name} ({formatFileSize(selected.size)})
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          You have read-only access to {noun} files.
        </p>
      )}

      {query.data && (page > 1 || query.data.total > query.data.pageSize) ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * query.data.pageSize >= query.data.total}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {notice}
      </p>
    </section>
  );
}
