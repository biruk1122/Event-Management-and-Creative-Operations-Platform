"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  FilePenLine,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle,
  Mail,
  Paperclip,
  Receipt,
  Share2,
  Tag,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  formatFileSize,
} from "@/features/files/lib/file-types";
import { ShareDialog } from "@/features/sharing";

import {
  downloadDocumentFile,
  getDocument as defaultGetDocument,
  uploadDocumentFile,
} from "../api/documents-gateway";
import type {
  GetDocument,
  UpdateDocument,
  UpdateDocumentValues,
} from "../lib/documents-outcome";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentRecord,
  type DocumentType,
} from "../lib/documents-types";

const NONE = "NONE";
const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";

const DOCUMENT_ICONS: Record<DocumentType, typeof File> = {
  LETTER: Mail,
  REPORT: FileText,
  PRICE_QUOTATION: FileSpreadsheet,
  CONTRACT: FilePenLine,
  INVOICE: Receipt,
  OTHER: File,
};

const ACTION_ERRORS: Record<string, string> = {
  not_found: "This document no longer exists. Go back and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function formValuesOf(document: DocumentRecord): UpdateDocumentValues {
  return {
    displayName: document.displayName,
    documentType: document.documentType,
    projectId: document.projectId,
    description: document.description ?? "",
  };
}

function changedKeys(
  before: UpdateDocumentValues,
  after: UpdateDocumentValues,
): (keyof UpdateDocumentValues)[] {
  return (Object.keys(after) as (keyof UpdateDocumentValues)[]).filter(
    (key) => before[key] !== after[key],
  );
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    new Date(iso),
  );
}

interface DocumentDetailsViewProps {
  /** The listing URL with this document's id removed, so Back keeps the listing's filters. */
  backHref: string;
  documentId: string;
  projects: readonly { id: string; name: string }[];
  canShare: boolean;
  /** Opens straight into the edit form, as when Edit is chosen on the list. */
  startEditing?: boolean;
  getDocument?: GetDocument;
  onUpdate: UpdateDocument;
  onChanged: (document: DocumentRecord) => void;
  /** Called after a successful save, so the URL can drop the edit marker. */
  onSaved?: () => void;
}

/**
 * A document's details page, styled like the letter details page. It opens
 * read-only; Edit switches the details to a form that saves in place.
 */
export function DocumentDetailsView({
  backHref,
  documentId,
  projects,
  canShare,
  startEditing = false,
  getDocument = defaultGetDocument,
  onUpdate,
  onChanged,
  onSaved,
}: DocumentDetailsViewProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UpdateDocumentValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getDocument(documentId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setDocument(loaded);
          if (startEditing) {
            setForm(formValuesOf(loaded));
            setEditing(true);
          }
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
    // startEditing is read once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, getDocument]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!document || !form) return;
    setSaving(true);
    setSaveError(null);

    const changed = changedKeys(formValuesOf(document), form);
    const values = Object.fromEntries(
      changed.map((key) => [key, form[key]]),
    ) as Partial<UpdateDocumentValues>;
    const outcome = await onUpdate(document.id, values);

    setSaving(false);
    if (outcome.status === "success") {
      setDocument(outcome.document);
      setEditing(false);
      setForm(null);
      onChanged(outcome.document);
      onSaved?.();
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

  function pickFiles(files: File[]) {
    const file = files[0];
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
      const updated = await uploadDocumentFile(documentId, selectedFile);
      setDocument(updated);
      setSelectedFile(null);
      onChanged(updated);
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
        Loading document…
      </div>
    );
  }

  if (status === "error" || !document) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this document</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const lockType = document.sourceLetterId !== null;
  const TypeIcon = DOCUMENT_ICONS[document.documentType];
  const dirty =
    form !== null && changedKeys(formValuesOf(document), form).length > 0;
  const sourceLabel = document.sourceLetterReferenceNumber
    ? `From letter ${document.sourceLetterReferenceNumber}`
    : (document.projectName ?? "Standalone document");

  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" asChild>
        <Link href={backHref as Route}>
          <ArrowLeft aria-hidden="true" data-icon="inline-start" />
          Back
        </Link>
      </Button>

      <header className="border-border bg-card relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8">
        <div
          aria-hidden="true"
          className="from-primary/10 pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-linear-to-l to-transparent"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-center">
            <span className="bg-primary text-primary-foreground inline-flex size-16 shrink-0 items-center justify-center rounded-2xl shadow-sm">
              <FileText aria-hidden="true" className="size-7" />
            </span>
            <div className="min-w-0 space-y-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Document
              </p>
              <h1 className="text-3xl font-semibold tracking-tight break-words">
                {document.displayName}
              </h1>
              <p className="text-primary/70 text-sm">{sourceLabel}</p>
              <Badge variant="outline">
                {DOCUMENT_TYPE_LABELS[document.documentType]}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
        </div>
      </header>

      {canShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          parentKind="document"
          parentId={document.id}
          parentLabel={document.displayName}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {editing && form ? (
          <form
            onSubmit={(event) => void handleSave(event)}
            aria-label="Edit document"
            className={`${CARD} border-l-primary space-y-6 border-l-4`}
          >
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Info aria-hidden="true" className="text-primary size-4" />
              Edit document
            </h2>
            {saveError ? (
              <Alert variant="destructive" aria-live="assertive">
                <AlertTitle>{saveError}</AlertTitle>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="document-name">Name</Label>
              <Input
                id="document-name"
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.documentType}
                  onValueChange={(value) =>
                    setForm({ ...form, documentType: value as DocumentType })
                  }
                  disabled={lockType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                {lockType ? (
                  <p className="text-primary/70 text-xs">
                    A document created from a letter attachment stays type
                    Letter.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Document of</Label>
                <Select
                  value={form.projectId ?? NONE}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      projectId: value === NONE ? null : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No linked project</SelectItem>
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
              <Label htmlFor="document-description">Description</Label>
              <Textarea
                id="document-description"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </div>
            <div className="border-border flex flex-wrap justify-end gap-3 border-t pt-5">
              <Button variant="outline" disabled={saving} asChild>
                <Link href={backHref as Route}>Cancel</Link>
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
        ) : (
          <section
            aria-label="Document details"
            className={`${CARD} border-l-primary space-y-6 border-l-4`}
          >
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Info aria-hidden="true" className="text-primary size-4" />
              Document Details
            </h2>
            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
              {(
                [
                  [Tag, "Type", DOCUMENT_TYPE_LABELS[document.documentType]],
                  [FolderOpen, "Document of", sourceLabel],
                  [
                    CalendarDays,
                    "Uploaded",
                    document.fileAvailable
                      ? dateLabel(document.uploadedAt)
                      : null,
                  ],
                  [
                    UserRound,
                    "Uploaded by",
                    document.fileAvailable ? document.uploadedByName : null,
                  ],
                  [
                    HardDrive,
                    "Size",
                    document.fileAvailable && document.sizeBytes !== null
                      ? formatFileSize(document.sizeBytes)
                      : null,
                  ],
                  [FileText, "File", document.originalFilename],
                ] as const
              ).map(([Icon, label, value]) => (
                <div key={label} className="flex min-w-0 gap-3">
                  <span className="bg-accent text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-primary/70 text-xs">{label}</dt>
                    <dd className="mt-1 font-semibold break-words">
                      {value || "—"}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="border-border space-y-3 border-t pt-5">
              <div className="flex items-center gap-3">
                <span className="bg-accent text-primary inline-flex size-10 items-center justify-center rounded-xl">
                  <FileText aria-hidden="true" className="size-5" />
                </span>
                <h3 className="font-semibold">Description</h3>
              </div>
              <p className="text-primary/70 text-sm break-words whitespace-pre-wrap">
                {document.description || "No description added."}
              </p>
            </div>
          </section>
        )}

        <aside
          aria-label="Document type"
          className="border-border bg-accent/40 flex flex-col items-center justify-center gap-4 rounded-2xl border p-8 text-center shadow-sm"
        >
          <span className="bg-card text-primary inline-flex size-24 items-center justify-center rounded-3xl shadow-sm">
            <TypeIcon aria-hidden="true" className="size-12" />
          </span>
          <p className="text-lg font-semibold">
            {DOCUMENT_TYPE_LABELS[document.documentType]}
          </p>
          <p className="text-primary/70 text-sm">
            {document.fileAvailable
              ? `${document.originalFilename ?? "File"}${document.sizeBytes !== null ? ` · ${formatFileSize(document.sizeBytes)}` : ""}`
              : "No file attached yet"}
          </p>
        </aside>
      </div>

      <section aria-label="File" className={CARD}>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Paperclip aria-hidden="true" className="text-primary size-4" />
          File
        </h2>
        {document.fileAvailable && document.originalFilename ? (
          <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-accent text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
                <FileText aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {document.originalFilename}
                </p>
                <p className="text-primary/70 text-sm">
                  {document.sizeBytes !== null
                    ? formatFileSize(document.sizeBytes)
                    : "Size unknown"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void downloadDocumentFile(documentId)}
            >
              <Download aria-hidden="true" />
              Download
            </Button>
          </div>
        ) : editing ? (
          <div className="space-y-4">
            {uploadError ? (
              <Alert variant="destructive">
                <AlertTitle>{uploadError}</AlertTitle>
              </Alert>
            ) : null}
            <AttachmentDropzone
              inputLabel="Choose document file"
              disabled={uploadBusy}
              accept={ACCEPTED_FILE_TYPES.join(",")}
              multiple={false}
              hint="PDF, images, text, CSV, or Office documents up to 100 MB."
              onFiles={pickFiles}
            />
            <div className="flex flex-wrap items-center gap-2">
              {selectedFile ? (
                <p className="text-primary/70 min-w-0 truncate text-sm">
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
          </div>
        ) : (
          <p className="text-primary/70 text-sm">No file attached yet.</p>
        )}
      </section>
    </div>
  );
}
