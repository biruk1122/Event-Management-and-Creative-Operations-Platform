"use client";

import type { Route } from "next";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInZone } from "@/lib/app-timezone";

import {
  addCreativeRequestFeedback,
  downloadCreativeRequestFile,
  listCreativeRequestFeedback,
  listCreativeRequestFiles,
  moveCreativeRequest,
  uploadCreativeRequestFile,
} from "../api/creative-requests-gateway";
import {
  CREATIVE_ASSET_TYPE_LABELS,
  CREATIVE_REQUEST_FILE_KIND_LABELS,
  CREATIVE_REQUEST_MOVE_LABELS,
  CREATIVE_REQUEST_STATUS_LABELS,
  type CreativeRequest,
  type CreativeRequestFileKind,
  type CreativeRequestStatus,
} from "../lib/creative-requests-types";

/** Moves that need a written reason or note before they are sent. */
const NEEDS_TEXT: Partial<Record<CreativeRequestStatus, string>> = {
  DECLINED: "Why are you declining it?",
  CHANGES_REQUESTED: "What needs to change?",
};

function when(iso: string | null): string | null {
  return iso
    ? formatInZone(iso, { dateStyle: "medium", timeStyle: "short" })
    : null;
}

function personName(
  person: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
): string {
  if (!person) return "A former user";
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return name || person.email;
}

export function CreativeRequestDetail({
  request,
  queryKey,
  onChanged,
}: {
  request: CreativeRequest;
  /** Prefix for this request's feedback and files queries. */
  queryKey: readonly unknown[];
  onChanged: (request: CreativeRequest) => void;
}) {
  const id = useId();
  const client = useQueryClient();
  const [pendingMove, setPendingMove] = useState<CreativeRequestStatus | null>(
    null,
  );
  const [moveText, setMoveText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const feedbackKey = [...queryKey, "feedback", request.id];
  const filesKey = [...queryKey, "files", request.id];

  const feedback = useQuery({
    queryKey: feedbackKey,
    queryFn: ({ signal }) => listCreativeRequestFeedback(request.id, signal),
    retry: false,
  });
  const files = useQuery({
    queryKey: filesKey,
    queryFn: ({ signal }) => listCreativeRequestFiles(request.id, signal),
    retry: false,
  });

  const move = useMutation({
    mutationFn: (input: { to: CreativeRequestStatus; text?: string }) =>
      moveCreativeRequest(
        request.id,
        input.to,
        input.to === "DECLINED"
          ? { reason: input.text ?? "" }
          : { note: input.text ?? "" },
      ),
    onSuccess: (updated) => {
      setPendingMove(null);
      setMoveText("");
      setError(null);
      setNotice(
        `Request is now ${CREATIVE_REQUEST_STATUS_LABELS[updated.status].toLowerCase()}.`,
      );
      onChanged(updated);
      void client.invalidateQueries({ queryKey: feedbackKey });
    },
    onError: (caught) => setError(caught.message),
  });
  const addNote = useMutation({
    mutationFn: (text: string) => addCreativeRequestFeedback(request.id, text),
    onSuccess: () => {
      setNote("");
      setError(null);
      setNotice("Feedback added.");
      void client.invalidateQueries({ queryKey: feedbackKey });
    },
    onError: (caught) => setError(caught.message),
  });
  const upload = useMutation({
    mutationFn: (input: { kind: CreativeRequestFileKind; file: File }) =>
      uploadCreativeRequestFile(request.id, input.kind, input.file),
    onSuccess: (file) => {
      setError(null);
      setNotice(`${file.filename} attached.`);
      void client.invalidateQueries({ queryKey: filesKey });
    },
    onError: (caught) => setError(caught.message),
  });
  const download = useMutation({
    mutationFn: (fileId: string) =>
      downloadCreativeRequestFile(request.id, fileId),
    onError: (caught) => setError(caught.message),
  });

  function startMove(to: CreativeRequestStatus) {
    setNotice("");
    if (NEEDS_TEXT[to]) {
      setPendingMove(to);
      setMoveText("");
      return;
    }
    move.mutate({ to });
  }

  function confirmMove(event: FormEvent) {
    event.preventDefault();
    if (!pendingMove) return;
    if (!moveText.trim()) {
      setError(NEEDS_TEXT[pendingMove] ?? "Add a note.");
      return;
    }
    move.mutate({ to: pendingMove, text: moveText.trim() });
  }

  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    addNote.mutate(note.trim());
  }

  const { abilities } = request;
  const details: [string, string | null][] = [
    ["Asset type", CREATIVE_ASSET_TYPE_LABELS[request.assetType]],
    [
      "From",
      `${request.requestingDepartment.name}, ${personName(request.requestedBy)}`,
    ],
    ["To", request.targetDepartment.name],
    ["Needed by", when(request.dueAt)],
    ["Campaign", request.campaign?.name ?? null],
    ["Sent", when(request.createdAt)],
    ["Delivered", when(request.deliveredAt)],
  ];

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="space-y-5 rounded-xl border p-4"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${id}-title`} className="text-base font-semibold">
            {request.title}
          </h3>
          <Badge variant="secondary">
            {CREATIVE_REQUEST_STATUS_LABELS[request.status]}
          </Badge>
          {abilities.readOnly ? (
            <Badge variant="outline">View only</Badge>
          ) : null}
        </div>
        <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {details
            .filter((entry): entry is [string, string] => entry[1] !== null)
            .map(([label, value]) => (
              <div key={label} className="flex gap-1">
                <dt className="font-medium">{label}:</dt>
                <dd className="text-foreground min-w-0 break-words">{value}</dd>
              </div>
            ))}
        </dl>
        {request.task ? (
          <p className="text-sm">
            Production task:{" "}
            <Link
              className="underline underline-offset-4"
              href={`/tasks/${request.task.id}` as Route}
            >
              {request.task.title}
            </Link>
          </p>
        ) : null}
      </header>

      <section aria-labelledby={`${id}-requirements`} className="space-y-1">
        <h4 id={`${id}-requirements`} className="text-sm font-medium">
          Requirements
        </h4>
        <p className="text-sm break-words whitespace-pre-wrap">
          {request.requirements}
        </p>
        {request.declineReason ? (
          <p className="text-sm">
            <span className="font-medium">Declined: </span>
            {request.declineReason}
          </p>
        ) : null}
      </section>

      {abilities.moves.length > 0 ? (
        <section aria-label="Actions" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {abilities.moves.map((to) => (
              <Button
                key={to}
                type="button"
                size="sm"
                variant={
                  to === "DECLINED" || to === "CANCELLED"
                    ? "outline"
                    : "default"
                }
                disabled={move.isPending}
                onClick={() => startMove(to)}
              >
                {CREATIVE_REQUEST_MOVE_LABELS[to] ?? to}
              </Button>
            ))}
          </div>
          {pendingMove ? (
            <form className="space-y-2" onSubmit={confirmMove}>
              <Label htmlFor={`${id}-move-text`}>
                {NEEDS_TEXT[pendingMove]}
              </Label>
              <Textarea
                id={`${id}-move-text`}
                value={moveText}
                rows={3}
                maxLength={pendingMove === "DECLINED" ? 2000 : 5000}
                onChange={(event) => setMoveText(event.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={move.isPending}>
                  {CREATIVE_REQUEST_MOVE_LABELS[pendingMove]}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingMove(null)}
                >
                  Back
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p role="status" className="sr-only">
        {notice}
      </p>

      <section aria-labelledby={`${id}-files`} className="space-y-2">
        <h4 id={`${id}-files`} className="text-sm font-medium">
          Files
        </h4>
        {files.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading files…
          </p>
        ) : files.isError ? (
          <p role="alert" className="text-sm">
            Files could not be loaded.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => void files.refetch()}
            >
              Try again
            </button>
          </p>
        ) : files.data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No files yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {files.data.items.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-all">
                  {file.filename}{" "}
                  <span className="text-muted-foreground">
                    · {CREATIVE_REQUEST_FILE_KIND_LABELS[file.kind]}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={download.isPending}
                  aria-label={`Download ${file.filename}`}
                  onClick={() => download.mutate(file.id)}
                >
                  <Download aria-hidden="true" />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}
        {abilities.canAttach.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {abilities.canAttach.map((kind) => (
              <label
                key={kind}
                className="border-input hover:bg-muted/50 focus-within:ring-ring/50 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm focus-within:ring-3"
              >
                {upload.isPending ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Upload aria-hidden="true" className="size-4" />
                )}
                Add {CREATIVE_REQUEST_FILE_KIND_LABELS[kind].toLowerCase()}
                <input
                  type="file"
                  className="sr-only"
                  disabled={upload.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) upload.mutate({ kind, file });
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-feedback`} className="space-y-2">
        <h4 id={`${id}-feedback`} className="text-sm font-medium">
          Feedback
        </h4>
        {feedback.isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading feedback…
          </p>
        ) : feedback.isError ? (
          <p role="alert" className="text-sm">
            Feedback could not be loaded.
          </p>
        ) : feedback.data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No feedback yet.</p>
        ) : (
          <ol className="space-y-2">
            {feedback.data.items.map((item) => (
              <li key={item.id} className="rounded-lg border px-3 py-2 text-sm">
                <p className="text-muted-foreground text-xs">
                  {personName(item.author)} · {when(item.createdAt)}
                </p>
                <p className="break-words whitespace-pre-wrap">{item.note}</p>
              </li>
            ))}
          </ol>
        )}
        {abilities.canAddFeedback ? (
          <form className="space-y-2" onSubmit={submitNote}>
            <Label htmlFor={`${id}-note`}>Add feedback</Label>
            <Textarea
              id={`${id}-note`}
              value={note}
              rows={2}
              maxLength={5000}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={addNote.isPending || !note.trim()}
            >
              Add feedback
            </Button>
          </form>
        ) : null}
      </section>
    </article>
  );
}
