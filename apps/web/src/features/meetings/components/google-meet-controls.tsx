"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as gateway from "../api/google-meet-gateway";
import type { Meeting } from "../api/meetings-gateway";

/** Mounted only for an authorized organizer. Backend checks are authoritative. */
export function GoogleMeetControls({
  meeting,
  userId,
}: {
  meeting: Meeting;
  userId: string;
}) {
  const client = useQueryClient();
  const manualId = useId();
  const consentId = useId();
  const [consent, setConsent] = useState(false);
  const [manualLink, setManualLink] = useState(meeting.onlineLink ?? "");
  const [notice, setNotice] = useState("");
  const status = useQuery({
    queryKey: ["meet-integration", userId, meeting.id],
    queryFn: () => gateway.meetStatus(meeting.id),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const action = useMutation({
    mutationFn: async (
      kind: "connect" | "sync" | "cleanup" | "disconnect" | "manual",
    ) => {
      setNotice("");
      if (kind === "connect") {
        if (!consent)
          throw new Error("Review and accept the calendar consent first.");
        const destination = new URL(await gateway.authorizeGoogle());
        if (destination.origin !== "https://accounts.google.com")
          throw new Error("The Google consent destination is invalid.");
        window.location.assign(destination.href);
      } else if (kind === "sync") await gateway.syncGoogle(meeting.id);
      else if (kind === "cleanup") {
        await gateway.cleanupGoogle(meeting.id);
        setNotice(
          "Calendar export removed. The current link is kept as a manual link; the Meet room may still be accessible.",
        );
      } else if (kind === "disconnect") {
        const result = await gateway.disconnectGoogle();
        setNotice(
          result.remoteRevoked
            ? "Disconnected. Existing Meet links may still work."
            : "Local credentials erased. Google revocation could not be confirmed. Revoke Lela under your Google Account connections and remove calendar exports there if needed.",
        );
      } else {
        await gateway.saveManualMeetingLink(meeting.id, manualLink);
        setNotice(
          "Manual link saved. Any previous calendar export is queued for cleanup.",
        );
      }
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["meet-integration", userId] }),
        client.invalidateQueries({ queryKey: ["meetings", userId] }),
      ]);
    },
  });
  const connected = status.data?.connection === "CONNECTED";
  const scheduled =
    meeting.status === "SCHEDULED" && meeting.type !== "PHYSICAL";
  return (
    <section
      aria-label="Google Meet integration"
      className="mt-5 space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-medium">Google Meet · optional</h3>
      <p className="text-muted-foreground text-sm">
        Manual HTTPS links always work without connecting Google. Connecting is
        not Google sign-in to Lela.
      </p>
      {status.isPending ? (
        <p role="status">Checking Google connection…</p>
      ) : null}
      {status.error ? <p role="alert">{status.error.message}</p> : null}
      {status.data ? (
        <p className="text-sm">
          Connection:{" "}
          {status.data.connection.replaceAll("_", " ").toLowerCase()}. Calendar
          export: {status.data.exportState.replaceAll("_", " ").toLowerCase()}.
          {status.data.failure
            ? " Needs attention; keep using a manual link."
            : ""}
        </p>
      ) : null}
      {status.data && !status.data.enabled ? (
        <p className="text-sm">
          Automatic links are off until the operator completes the no-billing
          activation review.
        </p>
      ) : null}
      {status.data?.enabled && !connected ? (
        <div className="space-y-2">
          <p className="text-sm">
            Google will grant offline access to events on calendars you own (not
            just Lela events), plus your verified account identity
            (openid/email). Lela exports only “Lela meeting” and UTC meeting
            times to a private event on your primary calendar—no participants,
            titles, minutes or files. Calendar delegates/administrators may
            still see it. Tokens are encrypted on the server. You can disconnect
            at any time.
          </p>
          <label htmlFor={consentId} className="flex items-start gap-2 text-sm">
            <input
              id={consentId}
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I agree to connect my organizer account with these permissions.
          </label>
          <Button
            variant="outline"
            disabled={!consent || action.isPending}
            onClick={() => action.mutate("connect")}
          >
            Connect Google Calendar
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {scheduled && connected && status.data?.enabled ? (
          <Button
            disabled={action.isPending}
            onClick={() => action.mutate("sync")}
          >
            Generate / sync Meet link
          </Button>
        ) : null}
        {connected &&
        status.data?.enabled &&
        status.data.exportState !== "NONE" &&
        status.data.exportState !== "DETACHED" ? (
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate("cleanup")}
          >
            Remove calendar export
          </Button>
        ) : null}
        {connected ||
        status.data?.connection === "RECONNECT_REQUIRED" ||
        status.data?.connection === "REVOCATION_FAILED" ? (
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate("disconnect")}
          >
            Disconnect Google
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={action.isPending || status.isFetching}
          onClick={() => void status.refetch()}
        >
          Refresh Google status
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Removing an export or disconnecting does not disable the Meet room.
        Reschedules and cancellations queue calendar updates; a provider failure
        never cancels your Lela meeting.
      </p>
      {scheduled ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate("manual");
          }}
        >
          <Label htmlFor={manualId}>Manual online meeting link</Label>
          <Input
            id={manualId}
            type="url"
            required
            pattern="https://.*"
            value={manualLink}
            onChange={(event) => setManualLink(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={action.isPending}>
            Save manual link
          </Button>
        </form>
      ) : null}
      {action.error ? <p role="alert">{action.error.message}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
