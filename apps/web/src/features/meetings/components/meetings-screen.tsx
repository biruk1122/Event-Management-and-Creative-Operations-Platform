"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Response = "PENDING" | "ACCEPTED" | "DECLINED";

const responseLabel: Record<Response, string> = {
  PENDING: "Pending response",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

/**
 * MTG-04's accessible presentation surface. API reads/mutations are deliberately
 * introduced by MTG-05; this slice establishes the responsive interaction and
 * recovery states without duplicating the backend contract.
 */
export function MeetingsScreen() {
  const [response, setResponse] = useState<Response>("PENDING");
  const [notice, setNotice] = useState<string | null>(null);

  function respond(next: Exclude<Response, "PENDING">) {
    setResponse(next);
    setNotice(`Your response is marked ${next.toLowerCase()}.`);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Meetings</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your schedule
          </h1>
        </div>
        <Button type="button" disabled aria-describedby="meeting-create-help">
          Schedule meeting
        </Button>
        <p id="meeting-create-help" className="sr-only">
          Scheduling will be available when meeting API integration is enabled.
        </p>
      </header>

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {notice}
        </p>
      ) : null}

      <section
        aria-labelledby="meeting-preview-title"
        className="rounded-lg border p-4 sm:p-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 id="meeting-preview-title" className="text-lg font-medium">
              Meeting details
            </h2>
            <p className="text-muted-foreground text-sm">
              Select a meeting to view its time, participants, location or
              online link, and reminder.
            </p>
          </div>
          <Badge variant="secondary">No meeting selected</Badge>
        </div>
        <div className="mt-6 rounded-md bg-muted/50 p-4">
          <p className="font-medium">No meetings to show</p>
          <p className="text-muted-foreground mt-1 text-sm">
            When you are invited to a meeting, it will appear here and in your
            calendar.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="response-title"
        className="rounded-lg border p-4 sm:p-6"
      >
        <h2 id="response-title" className="text-lg font-medium">
          Invitation response
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Responses are final after you accept or decline. You can still review
          the meeting details in your calendar.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Badge aria-label={`Current response: ${responseLabel[response]}`}>
            {responseLabel[response]}
          </Badge>
          <div
            className="flex gap-2"
            role="group"
            aria-label="Respond to meeting invitation"
          >
            <Button
              type="button"
              variant="outline"
              disabled={response !== "PENDING"}
              onClick={() => respond("ACCEPTED")}
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={response !== "PENDING"}
              onClick={() => respond("DECLINED")}
            >
              Decline
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
