"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useResolveSmsMessage, useSmsMessage } from "../api/sms-queries";
import type { SmsResolutionDecision } from "../api/sms-gateway";
import {
  categoryLabel,
  reasonLabel,
  SMS_OUTCOME_LABELS,
  statusLabel,
  type SmsTone,
} from "../lib/sms-labels";
import { SmsConfirmDialog } from "./sms-confirm-dialog";

const TONE_CLASS: Record<
  SmsTone,
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "information"
  | "secondary"
> = {
  neutral: "secondary",
  info: "information",
  success: "success",
  warning: "warning",
  danger: "destructive",
};

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

/** The reduced provider fields the API returns. Free text is never part of this shape. */
function providerText(
  response: { acknowledge: string | null; status: string | null } | null,
): string | null {
  if (!response) return null;
  const parts = [response.acknowledge, response.status].filter(
    (value): value is string => value !== null && value !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function SmsMessageDialog({
  id,
  canUpdate,
  onOpenChange,
}: {
  id: string | null;
  canUpdate: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const message = useSmsMessage(id);
  const [decision, setDecision] = useState<SmsResolutionDecision | null>(null);
  const resolve = useResolveSmsMessage(id ?? "");
  const [resolved, setResolved] = useState("");

  const confirmResolution = () => {
    if (!decision) return;
    resolve.mutate(decision, {
      onSuccess: () => {
        setResolved(
          decision === "CANCEL"
            ? "The message was marked as cancelled. It will not be sent."
            : "The message was requeued. It will be sent again.",
        );
        setDecision(null);
      },
      onError: () => setDecision(null),
    });
  };

  const uncertain = message.data?.status === "UNCERTAIN";

  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>SMS details</DialogTitle>
          <DialogDescription>
            Phone numbers are masked. Provider text is limited to
            acknowledgement and status fields.
          </DialogDescription>
        </DialogHeader>

        {message.isPending ? <p role="status">Loading message...</p> : null}
        {message.isError ? <p role="alert">{message.error.message}</p> : null}

        {message.data ? (
          <div className="grid gap-4">
            {uncertain ? (
              <p role="alert" className="font-medium">
                The send outcome is unknown. Do not resend this message. Check
                with the provider first.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={TONE_CLASS[statusLabel(message.data.status).tone]}
              >
                {statusLabel(message.data.status).label}
              </Badge>
              <span className="text-sm">
                {statusLabel(message.data.status).detail}
              </span>
            </div>

            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt>Category</dt>
              <dd>{categoryLabel(message.data.category)}</dd>
              <dt>Recipient</dt>
              <dd>
                {message.data.recipientName ?? "Unknown recipient"}{" "}
                {message.data.recipientPhoneMasked ?? ""}
              </dd>
              <dt>Created</dt>
              <dd>{when(message.data.createdAt)}</dd>
              <dt>Accepted by provider</dt>
              <dd>{when(message.data.acceptedAt)}</dd>
              <dt>Status checked</dt>
              <dd>{when(message.data.providerStatusCheckedAt)}</dd>
              <dt>Callback received</dt>
              <dd>{when(message.data.callbackReceivedAt)}</dd>
              <dt>Scheduled for</dt>
              <dd>{when(message.data.sourceDueAt)}</dd>
              <dt>Reason</dt>
              <dd>
                {reasonLabel(
                  message.data.skipReason ?? message.data.lastError,
                ) ?? "None"}
              </dd>
            </dl>

            <div className="grid gap-1">
              <h3 className="font-semibold">Message</h3>
              <p className="text-sm whitespace-pre-wrap">{message.data.body}</p>
            </div>

            <div className="grid gap-2">
              <h3 className="font-semibold">Delivery attempts</h3>
              {message.data.deliveryAttempts.length === 0 ? (
                <p className="text-sm">No delivery attempts were made.</p>
              ) : (
                <ol className="grid gap-3">
                  {message.data.deliveryAttempts.map((attempt) => {
                    const outcome = SMS_OUTCOME_LABELS[attempt.outcome] ?? {
                      label: attempt.outcome.toLowerCase(),
                      tone: "neutral" as const,
                    };
                    const text = providerText(attempt.providerResponse);
                    return (
                      <li
                        key={attempt.attemptNumber}
                        className="grid gap-1 rounded-md border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            Attempt {attempt.attemptNumber}
                          </span>
                          <Badge variant={TONE_CLASS[outcome.tone]}>
                            {outcome.label}
                          </Badge>
                          {attempt.providerHttpStatus ? (
                            <span>HTTP {attempt.providerHttpStatus}</span>
                          ) : null}
                        </div>
                        <span>Started {when(attempt.startedAt)}</span>
                        <span>Finished {when(attempt.finishedAt)}</span>
                        {attempt.error ? (
                          <span>Error: {attempt.error}</span>
                        ) : null}
                        {text ? <span>Provider: {text}</span> : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {uncertain && canUpdate ? (
              <section
                aria-labelledby="sms-resolve-heading"
                className="grid gap-2"
              >
                <h3 id="sms-resolve-heading" className="font-semibold">
                  Resolve this uncertain send
                </h3>
                <p className="text-sm">
                  Choose one only after checking with the provider. Neither
                  option happens automatically.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={resolve.isPending}
                    onClick={() => setDecision("CANCEL")}
                  >
                    Mark as cancelled
                  </Button>
                  <Button
                    variant="outline"
                    disabled={resolve.isPending}
                    onClick={() => setDecision("REQUEUE")}
                  >
                    Requeue
                  </Button>
                </div>
                {resolved ? (
                  <p role="status" className="text-sm">
                    {resolved}
                  </p>
                ) : null}
                {resolve.isError ? (
                  <p role="alert" className="text-sm">
                    {resolve.error.message}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        <SmsConfirmDialog
          open={decision !== null}
          pending={resolve.isPending}
          title={
            decision === "REQUEUE"
              ? "Requeue this message?"
              : "Mark this message as cancelled?"
          }
          confirmLabel={
            decision === "REQUEUE" ? "Requeue message" : "Mark as cancelled"
          }
          onConfirm={confirmResolution}
          onCancel={() => setDecision(null)}
        >
          {decision === "REQUEUE" ? (
            <p>
              Lela will send this message again. If the provider already
              delivered the first send, the recipient will get a duplicate.
              Requeue only after checking with the provider that it was not
              delivered.
            </p>
          ) : (
            <p>
              The message will not be sent. Its record stays in history. Use
              this when the message was not delivered and should not be sent.
            </p>
          )}
        </SmsConfirmDialog>
      </DialogContent>
    </Dialog>
  );
}
