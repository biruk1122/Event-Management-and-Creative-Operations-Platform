"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, X } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeRecipientPicker } from "./employee-recipient-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createDocumentShare,
  createLetterShare,
  listDocumentShares,
  listLetterShares,
  revokeShare,
} from "../api/sharing-gateway";
import {
  SHARE_SCOPE_LABELS,
  shareAudienceLabel,
  type Share,
  type ShareRecipientOption,
  type ShareScope,
} from "../lib/sharing-types";

const SHARE_ERRORS: Record<string, string> = {
  not_found: "This record no longer exists. Close this and refresh the list.",
  already_exists: "This is already actively shared with that audience.",
  permission_denied: "You do not have permission to share this.",
  unexpected: "We could not share this. Try again.",
};

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentKind: "letter" | "document";
  parentId: string;
  parentLabel: string;
  onCloseAutoFocus?: (event: Event) => void;
}

export function ShareDialog({
  open,
  onOpenChange,
  parentKind,
  parentId,
  parentLabel,
  onCloseAutoFocus,
}: ShareDialogProps) {
  const client = useQueryClient();
  const queryKey = ["shares", parentKind, parentId] as const;

  const sharesQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      parentKind === "letter"
        ? listLetterShares(parentId, signal)
        : listDocumentShares(parentId, signal),
    enabled: open,
    retry: false,
  });

  const [audience, setAudience] = useState<"recipient" | "all">("recipient");
  const [recipient, setRecipient] = useState<ShareRecipientOption | null>(null);
  const [scope, setScope] = useState<ShareScope>("VIEW");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const scopeId = useId();

  // Reset the form whenever the dialog transitions from closed to open,
  // using the "adjust state during render" pattern (not an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAudience("recipient");
      setRecipient(null);
      setScope("VIEW");
      setFormError(null);
    }
  }

  async function handleShare(event: FormEvent) {
    event.preventDefault();
    if (audience === "recipient" && !recipient) {
      setFormError("Choose an employee to share with.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const values = {
      recipientId: audience === "recipient" ? (recipient?.id ?? null) : null,
      allEmployees: audience === "all",
      scope,
    };
    const outcome =
      parentKind === "letter"
        ? await createLetterShare(parentId, values)
        : await createDocumentShare(parentId, values);
    setSubmitting(false);
    if (outcome.status === "success") {
      setRecipient(null);
      void client.invalidateQueries({ queryKey });
      return;
    }
    if (outcome.status === "assignment_invalid") {
      setFormError(outcome.detail ?? SHARE_ERRORS.unexpected!);
      return;
    }
    setFormError(SHARE_ERRORS[outcome.status] ?? SHARE_ERRORS.unexpected!);
  }

  async function handleRevoke(shareId: string) {
    setRevokingId(shareId);
    await revokeShare(shareId);
    setRevokingId(null);
    void client.invalidateQueries({ queryKey });
  }

  const shares: Share[] = sharesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Share &ldquo;{parentLabel}&rdquo;</DialogTitle>
          <DialogDescription>
            Grant view or download access without changing management
            permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">Currently shared with</p>
          {sharesQuery.isPending ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : sharesQuery.isError ? (
            <p className="text-destructive text-sm">
              We could not load the current shares.
            </p>
          ) : shares.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Not shared with anyone yet.
            </p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {shares.map((share) => (
                <li
                  key={share.id}
                  className="flex items-center justify-between gap-2 p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {share.allEmployees ? (
                        <Users aria-hidden="true" className="size-4" />
                      ) : null}
                      {shareAudienceLabel(share)}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {SHARE_SCOPE_LABELS[share.scope]} · shared by{" "}
                      {share.sharedByName ?? "—"}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={revokingId === share.id}
                    aria-busy={revokingId === share.id}
                    onClick={() => void handleRevoke(share.id)}
                  >
                    <X aria-hidden="true" data-icon="inline-start" />
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          aria-label="Add a share"
          className="border-border space-y-4 border-t pt-4"
          onSubmit={(event) => void handleShare(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div
            role="tablist"
            aria-label="Share audience"
            className="flex gap-2"
          >
            <Button
              type="button"
              variant={audience === "recipient" ? "default" : "outline"}
              size="sm"
              role="tab"
              aria-selected={audience === "recipient"}
              onClick={() => setAudience("recipient")}
            >
              One employee
            </Button>
            <Button
              type="button"
              variant={audience === "all" ? "default" : "outline"}
              size="sm"
              role="tab"
              aria-selected={audience === "all"}
              onClick={() => setAudience("all")}
            >
              All employees
            </Button>
          </div>

          {audience === "recipient" ? (
            <EmployeeRecipientPicker
              key={`${parentKind}:${parentId}:${open}`}
              value={recipient}
              onChange={setRecipient}
              disabled={submitting}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={scopeId}>Access</Label>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as ShareScope)}
            >
              <SelectTrigger id={scopeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SHARE_SCOPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={submitting || (audience === "recipient" && !recipient)}
            aria-busy={submitting}
          >
            {submitting ? "Sharing…" : "Share"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
