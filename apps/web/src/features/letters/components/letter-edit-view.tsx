"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Info,
  LoaderCircle,
  Mail,
  Paperclip,
  Share2,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCEPTED_FILE_TYPES,
  fileSelectionError,
  type EventFile,
} from "@/features/files/lib/file-types";
import { ShareDialog } from "@/features/sharing";

import {
  getLetter as defaultGetLetter,
  listLetterFiles,
  uploadLetterFile,
} from "../api/letters-gateway";
import type {
  GetLetter,
  UpdateLetter,
  UpdateLetterValues,
} from "../lib/letters-outcome";
import {
  LETTER_CATEGORY_LABELS,
  letterPartyLabel,
  type Letter,
} from "../lib/letters-types";

import { LetterAttachmentList } from "./letter-attachment-list";

const NONE = "NONE";

const ACTION_ERRORS: Record<string, string> = {
  not_found: "This letter no longer exists. Go back and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function hrValuesOf(letter: Letter): UpdateLetterValues {
  return {
    date: letter.date,
    projectId: letter.projectId,
    subject: letter.subject,
    fromParty: letter.fromParty ?? "",
    toParty: letter.toParty ?? "",
    senderReferenceNumber: letter.senderReferenceNumber ?? "",
    shortDescription: letter.shortDescription ?? "",
    remark: letter.remark ?? "",
  };
}

function changedKeys(
  before: UpdateLetterValues,
  after: UpdateLetterValues,
): (keyof UpdateLetterValues)[] {
  return (Object.keys(after) as (keyof UpdateLetterValues)[]).filter(
    (key) => before[key] !== after[key],
  );
}

export interface LetterEditViewProps {
  letterId: string;
  projects: readonly { id: string; name: string }[];
  canShare: boolean;
  /** The Back control shown at the top of the page. */
  backControl: ReactNode;
  /** Discards the edit and returns to the read-only details. */
  onCancel: () => void;
  getLetter?: GetLetter;
  onUpdate: UpdateLetter;
  /** Called after a successful save with the saved letter. */
  onChanged: (letter: Letter) => void;
}

/** The letter edit page: a header card, the edit form beside a summary card,
 * and the attachments below - the same arrangement as the documents edit page. */
export function LetterEditView({
  letterId,
  projects,
  canShare,
  backControl,
  onCancel,
  getLetter = defaultGetLetter,
  onUpdate,
  onChanged,
}: LetterEditViewProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [letter, setLetter] = useState<Letter | null>(null);
  const [form, setForm] = useState<UpdateLetterValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [files, setFiles] = useState<EventFile[]>([]);
  const [filesStatus, setFilesStatus] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getLetter(letterId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setLetter(loaded);
          setForm(hrValuesOf(loaded));
          setStatus("loaded");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    void listLetterFiles(letterId)
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
  }, [letterId, getLetter]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!letter || !form) return;
    setSaving(true);
    setSaveError(null);

    const changed = changedKeys(hrValuesOf(letter), form);
    const values = Object.fromEntries(
      changed.map((key) => [key, form[key]]),
    ) as Partial<UpdateLetterValues>;
    const outcome = await onUpdate(letter.id, values);

    setSaving(false);
    if (outcome.status === "success") {
      setLetter(outcome.letter);
      setForm(hrValuesOf(outcome.letter));
      onChanged(outcome.letter);
      return;
    }
    if (outcome.status === "field_errors") {
      setSaveError(
        Object.values(outcome.fieldErrors)[0] ?? "Check the details.",
      );
      return;
    }
    if (outcome.status === "assignment_invalid") {
      setSaveError(outcome.detail ?? ACTION_ERRORS.unexpected!);
      return;
    }
    setSaveError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  function pickFiles(picked: File[]) {
    const file = picked[0];
    if (!file) return;
    const error = fileSelectionError(file);
    if (error) {
      setUploadError(error);
      setSelectedFile(null);
      return;
    }
    setUploadError(null);
    setSelectedFile(file);
  }

  async function attachFile() {
    if (!selectedFile) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const uploaded = await uploadLetterFile(letterId, selectedFile);
      setFiles((current) => [...current, uploaded]);
      setSelectedFile(null);
      if (letter)
        onChanged({ ...letter, attachmentCount: letter.attachmentCount + 1 });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Upload failed. Try again.",
      );
    } finally {
      setUploadBusy(false);
    }
  }

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

  if (status === "error" || !letter || !form) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this letter</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const dirty = changedKeys(hrValuesOf(letter), form).length > 0;

  return (
    <div className="space-y-6">
      {backControl}

      <header className="border-border bg-card relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="from-primary/10 pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-linear-to-l to-transparent"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-center">
            <span className="bg-primary text-primary-foreground inline-flex size-16 shrink-0 items-center justify-center rounded-2xl shadow-sm">
              <Mail aria-hidden="true" className="size-7" />
            </span>
            <div className="min-w-0 space-y-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Letter
              </p>
              <h1 className="text-3xl font-semibold tracking-tight break-words">
                Edit {letter.referenceNumber}
              </h1>
              <p className="text-primary/70 text-sm">
                {letter.subject}
                {letter.projectName ? ` · ${letter.projectName}` : ""}
              </p>
              <Badge variant="outline">
                {LETTER_CATEGORY_LABELS[letter.category]}
              </Badge>
            </div>
          </div>
          {canShare ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShareOpen(true)}
            >
              <Share2 aria-hidden="true" />
              Share
            </Button>
          ) : null}
        </div>
      </header>

      {canShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          parentKind="letter"
          parentId={letter.id}
          parentLabel={letter.referenceNumber}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <form
          onSubmit={(event) => void handleSave(event)}
          aria-label="Edit letter"
          className="border-border bg-card border-l-primary space-y-6 rounded-2xl border border-l-4 p-6 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Info aria-hidden="true" className="text-primary size-4" />
            Edit letter
          </h2>
          {saveError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{saveError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.projectId ?? NONE}
                onValueChange={(value) =>
                  setForm({ ...form, projectId: value === NONE ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.target.value })
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{letterPartyLabel(letter)}</Label>
              <Input
                value={
                  letter.direction === "INCOMING"
                    ? form.fromParty
                    : form.toParty
                }
                onChange={(event) =>
                  setForm({
                    ...form,
                    [letter.direction === "INCOMING" ? "fromParty" : "toParty"]:
                      event.target.value,
                  })
                }
              />
            </div>
            {letter.direction === "INCOMING" ? (
              <div className="space-y-2">
                <Label>Sender&apos;s reference no.</Label>
                <Input
                  value={form.senderReferenceNumber}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      senderReferenceNumber: event.target.value,
                    })
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Short description</Label>
            <Textarea
              rows={3}
              value={form.shortDescription}
              onChange={(event) =>
                setForm({ ...form, shortDescription: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Remark</Label>
            <Textarea
              rows={3}
              value={form.remark}
              onChange={(event) =>
                setForm({ ...form, remark: event.target.value })
              }
            />
          </div>

          <div className="border-border flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!dirty || saving}
              aria-busy={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>

        <aside
          aria-label="Letter summary"
          className="border-border bg-accent/40 flex flex-col items-center justify-center gap-4 rounded-2xl border p-8 text-center shadow-sm"
        >
          <span className="bg-card inline-flex size-24 items-center justify-center rounded-2xl shadow-sm">
            <Mail aria-hidden="true" className="text-primary size-12" />
          </span>
          <p className="text-lg font-semibold">
            {LETTER_CATEGORY_LABELS[letter.category]}
          </p>
          <p className="text-muted-foreground text-sm">
            {letter.referenceNumber}
          </p>
        </aside>
      </div>

      <section
        aria-label="Attachments"
        className="border-border bg-card space-y-4 rounded-2xl border p-6 shadow-sm"
      >
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Paperclip aria-hidden="true" className="text-primary size-4" />
          Attachments
        </h2>
        {filesStatus === "loading" ? (
          <p className="text-muted-foreground text-sm">Loading attachments…</p>
        ) : filesStatus === "error" ? (
          <p className="text-destructive text-sm">
            We could not load attachments.
          </p>
        ) : files.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attachments yet.</p>
        ) : (
          <LetterAttachmentList letterId={letterId} files={files} />
        )}

        {uploadError ? (
          <Alert variant="destructive">
            <AlertTitle>{uploadError}</AlertTitle>
          </Alert>
        ) : null}

        <AttachmentDropzone
          inputLabel="Choose letter attachment"
          disabled={uploadBusy}
          accept={ACCEPTED_FILE_TYPES.join(",")}
          multiple={false}
          hint="PDF, images, text, CSV, or Office documents up to 100 MB."
          onFiles={pickFiles}
        />
        <div className="flex flex-wrap items-center gap-2">
          {selectedFile ? (
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              {selectedFile.name}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedFile || uploadBusy}
            aria-busy={uploadBusy}
            onClick={() => void attachFile()}
          >
            <Paperclip aria-hidden="true" data-icon="inline-start" />
            {uploadBusy ? "Attaching…" : "Attach file"}
          </Button>
        </div>
      </section>
    </div>
  );
}
