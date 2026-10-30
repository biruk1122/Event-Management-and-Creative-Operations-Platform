"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import type { AddRemark, ListRemarks } from "../lib/letters-outcome";
import type { LetterRemark } from "../lib/letters-types";

const ACTION_ERRORS: Record<string, string> = {
  not_found: "This letter no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that remark. Try again.",
};

interface LetterRemarksSheetProps {
  letterId: string | null;
  referenceNumber?: string | undefined;
  onOpenChange: (open: boolean) => void;
  listRemarks: ListRemarks;
  onAddRemark: AddRemark;
}

export function LetterRemarksSheet({
  letterId,
  referenceNumber,
  onOpenChange,
  listRemarks,
  onAddRemark,
}: LetterRemarksSheetProps) {
  return (
    <Sheet
      open={letterId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <SheetContent>
        {letterId !== null ? (
          <RemarksBody
            key={letterId}
            letterId={letterId}
            referenceNumber={referenceNumber}
            listRemarks={listRemarks}
            onAddRemark={onAddRemark}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function RemarksBody({
  letterId,
  referenceNumber,
  listRemarks,
  onAddRemark,
}: {
  letterId: string;
  referenceNumber?: string | undefined;
  listRemarks: ListRemarks;
  onAddRemark: AddRemark;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [remarks, setRemarks] = useState<LetterRemark[]>([]);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRemarks(letterId)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setRemarks(loaded);
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
  }, [letterId, listRemarks]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    const outcome = await onAddRemark(letterId, body.trim());
    setSubmitting(false);
    if (outcome.status === "success") {
      setRemarks((current) => [...current, outcome.remark]);
      setBody("");
      return;
    }
    setError(ACTION_ERRORS[outcome.status] ?? ACTION_ERRORS.unexpected!);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Remarks</SheetTitle>
        <SheetDescription>
          {referenceNumber ? `For ${referenceNumber}` : "Internal notes thread"}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {status === "loading" ? (
          <p
            role="status"
            aria-live="polite"
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading remarks…
          </p>
        ) : status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>We could not load remarks</AlertTitle>
          </Alert>
        ) : remarks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No remarks yet.</p>
        ) : (
          <ul className="space-y-3">
            {remarks.map((remark) => (
              <li
                key={remark.id}
                className="border-border bg-muted/30 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">
                    {remark.authorName ?? "Unknown"}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(remark.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {remark.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <Alert variant="destructive" aria-live="assertive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      <form
        aria-label="Add remark"
        className="border-border space-y-2 border-t pt-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <Textarea
          aria-label="Remark"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={4000}
        />
        <Button
          type="submit"
          size="sm"
          disabled={submitting || !body.trim()}
          aria-busy={submitting}
        >
          {submitting ? "Adding…" : "Add remark"}
        </Button>
      </form>
    </>
  );
}
