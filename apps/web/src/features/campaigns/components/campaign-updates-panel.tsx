"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type {
  CampaignDetailWriteResult,
  CampaignUpdate,
} from "../api/campaign-detail-gateway";
import { personName } from "../lib/campaigns-types";

export type CampaignUpdatesPanelProps = {
  campaignId: string;
  /** Whether the viewer may add an entry (campaign.update on this campaign). */
  canWrite: boolean;
  list: (campaignId: string) => Promise<CampaignUpdate[] | null>;
  add: (
    campaignId: string,
    note: string,
  ) => Promise<CampaignDetailWriteResult<CampaignUpdate>>;
};

const MAX_NOTE = 2000;

/**
 * The campaign's updates log (EVE-231). Entries are append-only: there is no
 * edit or delete, and a correction is a new entry. The newest entry is first.
 */
export function CampaignUpdatesPanel({
  campaignId,
  canWrite,
  list,
  add,
}: CampaignUpdatesPanelProps) {
  const ids = { note: useId(), heading: useId() };
  const [entries, setEntries] = useState<CampaignUpdate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let active = true;
    list(campaignId).then(
      (loaded) => {
        if (!active) return;
        if (loaded === null) setLoadFailed(true);
        else setEntries(loaded);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [campaignId, list]);

  async function submit() {
    const text = note.trim();
    if (text === "") {
      setError("Write the update before adding it.");
      return;
    }
    if (text.length > MAX_NOTE) {
      setError(`Keep the update to ${MAX_NOTE} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await add(campaignId, text);
    setBusy(false);
    if (outcome.status === "success") {
      setEntries((current) => [outcome.value, ...(current ?? [])]);
      setNote("");
      setAnnouncement("Update added.");
      return;
    }
    setError(outcome.message);
  }

  return (
    <section
      aria-labelledby={ids.heading}
      className="border-border space-y-3 border-t pt-4"
    >
      <div>
        <p id={ids.heading} className="text-sm font-medium">
          Updates
        </p>
        <p className="text-muted-foreground text-sm">
          A running log of what has happened. Entries cannot be edited or
          removed.
        </p>
      </div>

      {loadFailed ? (
        <p role="alert" className="text-destructive text-sm">
          The updates could not be loaded. Close and reopen the campaign to try
          again.
        </p>
      ) : entries === null ? (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading updates…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No updates yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-3">
              <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {entry.author
                  ? personName(entry.author)
                  : "A former team member"}{" "}
                ·{" "}
                <time dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}

      {canWrite ? (
        <div className="space-y-2">
          <Label htmlFor={ids.note}>Add an update</Label>
          <textarea
            id={ids.note}
            rows={2}
            value={note}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${ids.note}-error` : undefined}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
            onChange={(event) => setNote(event.target.value)}
          />
          {error ? (
            <p id={`${ids.note}-error`} className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void submit()}
          >
            {busy ? "Adding…" : "Add update"}
          </Button>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
