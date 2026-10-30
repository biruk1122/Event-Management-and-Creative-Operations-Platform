"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Paperclip, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
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
  DeleteDocument,
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

const ACTION_ERRORS: Record<string, string> = {
  not_found: "This document no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface DocumentDetailDialogProps {
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
  projects: readonly { id: string; name: string }[];
  canDelete: boolean;
  canShare: boolean;
  getDocument?: GetDocument;
  onUpdate: UpdateDocument;
  onDelete: DeleteDocument;
  onDeleted: () => void;
  onChanged: (document: DocumentRecord) => void;
}

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

export function DocumentDetailDialog({
  documentId,
  onOpenChange,
  ...bodyProps
}: DocumentDetailDialogProps) {
  return (
    <Dialog
      open={documentId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {documentId !== null ? (
          <DocumentDetailBody
            key={documentId}
            documentId={documentId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface DocumentDetailBodyProps {
  documentId: string;
  projects: readonly { id: string; name: string }[];
  canDelete: boolean;
  canShare: boolean;
  getDocument?: GetDocument;
  onUpdate: UpdateDocument;
  onDelete: DeleteDocument;
  onDeleted: () => void;
  onChanged: (document: DocumentRecord) => void;
}

function DocumentDetailBody({
  documentId,
  projects,
  canDelete,
  canShare,
  getDocument = defaultGetDocument,
  onUpdate,
  onDelete,
  onDeleted,
  onChanged,
}: DocumentDetailBodyProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [form, setForm] = useState<UpdateDocumentValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getDocument(documentId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setDocument(loaded);
          setForm(formValuesOf(loaded));
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
      setForm(formValuesOf(outcome.document));
      onChanged(outcome.document);
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

  async function runDelete() {
    if (!document) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await onDelete(document.id);
    setDeleteBusy(false);
    if (outcome.status === "success") {
      onDeleted();
      return;
    }
    setConfirmingDelete(false);
    setDeleteError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
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
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  if (status === "error" || !document || !form) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this document</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  const dirty = changedKeys(formValuesOf(document), form).length > 0;
  const lockType = document.sourceLetterId !== null;

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{document.displayName}</DialogTitle>
            <Badge variant="outline">
              {DOCUMENT_TYPE_LABELS[document.documentType]}
            </Badge>
          </div>
          {canShare ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
            >
              Share
            </Button>
          ) : null}
        </div>
        <DialogDescription>
          {document.sourceLetterReferenceNumber
            ? `From letter ${document.sourceLetterReferenceNumber}`
            : document.projectName
              ? document.projectName
              : "Standalone document"}
        </DialogDescription>
      </DialogHeader>

      {canShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          parentKind="document"
          parentId={document.id}
          parentLabel={document.displayName}
        />
      ) : null}

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
        {saveError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{saveError}</AlertTitle>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label>Name</Label>
          <Input
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
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lockType ? (
              <p className="text-muted-foreground text-xs">
                A document created from a letter attachment stays type Letter.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Document of</Label>
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
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={!dirty || saving}
          aria-busy={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="border-border space-y-3 border-t pt-4">
        <p className="text-sm font-medium">File</p>
        {document.fileAvailable && document.originalFilename ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <span className="min-w-0 flex-1 truncate text-sm">
              {document.originalFilename}{" "}
              {document.sizeBytes !== null ? (
                <span className="text-muted-foreground">
                  ({formatFileSize(document.sizeBytes)})
                </span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void downloadDocumentFile(documentId)}
            >
              Download
            </Button>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              No file attached yet.
            </p>
            {uploadError ? (
              <Alert variant="destructive">
                <AlertTitle>{uploadError}</AlertTitle>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES.join(",")}
                onChange={pickFile}
                className="max-w-xs"
              />
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
          </>
        )}
      </div>

      {canDelete ? (
        <div className="border-border space-y-2 border-t pt-4">
          {deleteError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{deleteError}</AlertTitle>
            </Alert>
          ) : null}
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Delete this document permanently?</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleteBusy}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteBusy}
                aria-busy={deleteBusy}
                onClick={() => void runDelete()}
              >
                {deleteBusy ? "Deleting…" : "Confirm delete"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete document
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}
