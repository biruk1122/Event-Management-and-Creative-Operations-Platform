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
  type EventFile,
} from "@/features/files/lib/file-types";
import { ShareDialog } from "@/features/sharing";

import {
  getLetter as defaultGetLetter,
  listLetterFiles,
  uploadLetterFile,
} from "../api/letters-gateway";
import type {
  DeleteLetter,
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
  not_found: "This letter no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

interface LetterDetailDialogProps {
  letterId: string | null;
  onOpenChange: (open: boolean) => void;
  projects: readonly { id: string; name: string }[];
  canDelete: boolean;
  canShare: boolean;
  getLetter?: GetLetter;
  onUpdate: UpdateLetter;
  onDelete: DeleteLetter;
  onDeleted: () => void;
  onChanged: (letter: Letter) => void;
}

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

export function LetterDetailDialog({
  letterId,
  onOpenChange,
  ...bodyProps
}: LetterDetailDialogProps) {
  return (
    <Dialog
      open={letterId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {letterId !== null ? (
          <LetterDetailBody key={letterId} letterId={letterId} {...bodyProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface LetterDetailBodyProps {
  letterId: string;
  projects: readonly { id: string; name: string }[];
  canDelete: boolean;
  canShare: boolean;
  getLetter?: GetLetter;
  onUpdate: UpdateLetter;
  onDelete: DeleteLetter;
  onDeleted: () => void;
  onChanged: (letter: Letter) => void;
}

function LetterDetailBody({
  letterId,
  projects,
  canDelete,
  canShare,
  getLetter = defaultGetLetter,
  onUpdate,
  onDelete,
  onDeleted,
  onChanged,
}: LetterDetailBodyProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [letter, setLetter] = useState<Letter | null>(null);
  const [form, setForm] = useState<UpdateLetterValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const [files, setFiles] = useState<EventFile[]>([]);
  const [filesStatus, setFilesStatus] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function runDelete() {
    if (!letter) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await onDelete(letter.id);
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
      const uploaded = await uploadLetterFile(letterId, selectedFile);
      setFiles((current) => [...current, uploaded]);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Edit {letter.referenceNumber}</DialogTitle>
            <Badge variant="outline">
              {LETTER_CATEGORY_LABELS[letter.category]}
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
          {letter.subject}
          {letter.projectName ? ` · ${letter.projectName}` : ""}
        </DialogDescription>
      </DialogHeader>

      {canShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          parentKind="letter"
          parentId={letter.id}
          parentLabel={letter.referenceNumber}
        />
      ) : null}

      <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
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
                letter.direction === "INCOMING" ? form.fromParty : form.toParty
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
            rows={2}
            value={form.shortDescription}
            onChange={(event) =>
              setForm({ ...form, shortDescription: event.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Remark</Label>
          <Textarea
            rows={2}
            value={form.remark}
            onChange={(event) =>
              setForm({ ...form, remark: event.target.value })
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
        <p className="text-sm font-medium">Attachments</p>
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
              <span className="text-sm">Delete this letter permanently?</span>
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
              Delete letter
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}
