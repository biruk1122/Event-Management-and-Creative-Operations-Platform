"use client";
import { useEffect, useId, useState } from "react";
import {
  Download,
  LoaderCircle,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  downloadFixtureFile,
  listFixtureFiles,
  removeFixtureFile,
  uploadFixtureFile,
} from "../api/file-fixtures";
import {
  ACCEPTED_FILE_TYPES,
  fileSelectionError,
  formatFileSize,
  type EventFile,
} from "../lib/file-types";
export type EventFilesPanelProps = {
  eventId: string;
  canRead: boolean;
  canUpdate: boolean;
  listFiles?: (id: string) => Promise<EventFile[]>;
  uploadFile?: (id: string, file: File) => Promise<EventFile>;
  removeFile?: (id: string, fileId: string) => Promise<void>;
  downloadFile?: (id: string, fileId: string) => Promise<void>;
};
export function EventFilesPanel({
  eventId,
  canRead,
  canUpdate,
  listFiles = listFixtureFiles,
  uploadFile = uploadFixtureFile,
  removeFile = removeFixtureFile,
  downloadFile = downloadFixtureFile,
}: EventFilesPanelProps) {
  const id = useId();
  const [files, setFiles] = useState<EventFile[] | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => {
    setError(null);
    setFiles(null);
    try {
      setFiles(await listFiles(eventId));
    } catch {
      setError("We could not load files. Try again.");
    }
  };
  useEffect(() => {
    void load();
  }, [eventId]);
  if (!canRead)
    return (
      <section className="border-border space-y-2 border-t pt-4">
        <h2 className="font-medium">Files</h2>
        <p role="alert" className="text-muted-foreground text-sm">
          You do not have permission to view files for this event.
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
    setBusy(true);
    setError(null);
    try {
      const next = await uploadFile(eventId, selected);
      setFiles((current) => [...(current ?? []), next]);
      setSelected(null);
      setNotice(`${next.filename} is ready to download.`);
    } catch {
      setError(
        "We could not attach that file. Your selection is still available to retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (file: EventFile) => {
    setBusy(true);
    try {
      await removeFile(eventId, file.id);
      setFiles((current) =>
        (current ?? []).filter((item) => item.id !== file.id),
      );
      setNotice(`${file.filename} was removed.`);
    } catch {
      setError("We could not remove that file. Try again.");
    } finally {
      setBusy(false);
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
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>File action needs attention</AlertTitle>
          <AlertDescription>
            {error}{" "}
            {files === null ? (
              <Button type="button" variant="link" onClick={() => void load()}>
                Retry
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {files === null ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Loading files...
        </p>
      ) : files.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No files are attached to this event yet.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{file.filename}</p>
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
                    void downloadFile(eventId, file.id)
                      .then(() =>
                        setNotice(
                          `Your download for ${file.filename} is ready.`,
                        ),
                      )
                      .catch(() =>
                        setError(
                          "We could not prepare that download. Try again.",
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
        <div className="rounded-lg border border-dashed p-3">
          <Label htmlFor={`${id}-upload`}>Add a file</Label>
          <p className="text-muted-foreground mt-1 text-xs">
            PDF, images, text, CSV, or Office documents up to 10 MB.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              id={`${id}-upload`}
              type="file"
              accept={ACCEPTED_FILE_TYPES.join(",")}
              disabled={busy}
              onChange={(event) => choose(event.target.files?.item(0) ?? null)}
            />
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
          You have read-only access to event files.
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {notice}
      </p>
    </section>
  );
}
