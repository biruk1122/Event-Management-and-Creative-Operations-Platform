"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { components } from "@event-platform/api-client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampaignProgress } from "@/features/campaigns/components/campaign-progress";
import { CampaignStatusBadge } from "@/features/campaigns/components/status-badges";
import {
  personName,
  type Campaign,
} from "@/features/campaigns/lib/campaigns-types";

type MarketingStrategy = components["schemas"]["MarketingStrategyResponse"];
type MarketingCampaign = Pick<
  Campaign,
  "id" | "name" | "status" | "progress" | "manager" | "teams"
>;

export interface MarketingStrategyBoardProps {
  campaign: MarketingCampaign;
  strategy: MarketingStrategy | null;
  state: "loading" | "ready" | "error" | "denied";
  onRetry?: () => void;
  canManage?: boolean;
  onSave?: (text: string) => Promise<void>;
  onRemove?: () => Promise<void>;
}

const MAX_STRATEGY_LENGTH = 2000;

/** Presentational marketing extension. EVE-163 supplies the API callbacks. */
export function MarketingStrategyBoard({
  campaign,
  strategy,
  state,
  onRetry,
  canManage = false,
  onSave,
  onRemove,
}: MarketingStrategyBoardProps) {
  const fieldId = useId();
  const errorId = useId();
  const countId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const wasEditing = useRef(editing);
  const wasConfirming = useRef(confirming);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (editing) fieldRef.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    if (wasConfirming.current && !confirming)
      (removeRef.current ?? editRef.current)?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  useEffect(() => {
    if (error && !busy) {
      if (editing) fieldRef.current?.focus();
      if (confirming) confirmRef.current?.focus();
    }
  }, [error, busy, editing, confirming]);

  function beginEdit() {
    setDraft(strategy?.strategy ?? "");
    setError("");
    setAnnouncement("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      setError("Enter a strategy before saving.");
      fieldRef.current?.focus();
      return;
    }
    if (text.length > MAX_STRATEGY_LENGTH || !onSave) return;
    setBusy(true);
    setError("");
    try {
      await onSave(text);
      setEditing(false);
      setAnnouncement(strategy ? "Strategy updated." : "Strategy created.");
    } catch {
      setError("We could not save the strategy. Try again.");
      fieldRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setBusy(true);
    setError("");
    try {
      await onRemove();
      setConfirming(false);
      setAnnouncement("Strategy removed. The campaign remains available.");
    } catch {
      setError("We could not remove the strategy. Try again.");
      confirmRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading")
    return <p role="status">Loading marketing strategy…</p>;
  if (state === "denied")
    return (
      <p role="alert">You do not have access to this marketing strategy.</p>
    );
  if (state === "error")
    return (
      <Alert>
        <AlertTitle>Marketing strategy could not be loaded</AlertTitle>
        <AlertDescription>
          <Button variant="outline" onClick={onRetry} disabled={!onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );

  return (
    <section
      aria-label={`Marketing strategy for ${campaign.name}`}
      className="min-w-0 space-y-5"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-balance">
            Marketing strategy
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
            Plan the approach for {campaign.name}. Activities, assignments,
            status, and budget remain in the campaign overview.
          </p>
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </div>

      <div className="border-border grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium">Campaign progress</h3>
          <CampaignProgress
            progress={campaign.progress}
            label={`Progress of ${campaign.name}`}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium">People</h3>
          <p className="text-muted-foreground text-sm break-words">
            Manager:{" "}
            {campaign.manager ? personName(campaign.manager) : "Unassigned"}
          </p>
          <div className="flex flex-wrap gap-1.5" aria-label="Assigned teams">
            {campaign.teams.length ? (
              campaign.teams.map((team) => (
                <Badge
                  key={team.id}
                  variant="secondary"
                  className="max-w-full break-words whitespace-normal"
                >
                  {team.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">
                No teams assigned
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border-border min-w-0 space-y-4 rounded-xl border p-4 sm:p-5">
        {strategy ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Approach</h3>
            <p className="text-sm break-words whitespace-pre-wrap">
              {strategy.strategy}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <h3 className="text-sm font-medium">No strategy yet</h3>
            <p className="text-muted-foreground text-sm">
              Add an approach for this campaign before planning delivery.
            </p>
          </div>
        )}

        {!canManage && (
          <p className="text-muted-foreground text-sm">
            Read-only access. You can review the strategy and campaign progress.
          </p>
        )}
        {canManage && !onSave && (
          <p className="text-muted-foreground text-sm">
            Strategy editing is not available right now.
          </p>
        )}

        {canManage && !editing && !confirming && (
          <div className="flex flex-wrap gap-2">
            <Button
              ref={editRef}
              type="button"
              onClick={beginEdit}
              disabled={!onSave}
            >
              {strategy ? "Edit strategy" : "Add strategy"}
            </Button>
            {strategy && (
              <Button
                ref={removeRef}
                type="button"
                variant="destructive"
                onClick={() => setConfirming(true)}
                disabled={!onRemove}
              >
                Remove strategy
              </Button>
            )}
          </div>
        )}

        {canManage && editing && (
          <form
            onSubmit={(event) => void save(event)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) {
                event.stopPropagation();
                cancelEdit();
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor={fieldId}>Strategy</Label>
              <Textarea
                ref={fieldRef}
                id={fieldId}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${countId} ${errorId}` : countId}
                maxLength={MAX_STRATEGY_LENGTH}
                rows={6}
                disabled={busy}
              />
              <p id={countId} className="text-muted-foreground text-xs">
                {draft.length} of {MAX_STRATEGY_LENGTH} characters
              </p>
            </div>
            {error && (
              <p id={errorId} role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !onSave}>
                {busy ? "Saving…" : "Save strategy"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {canManage && confirming && (
          <div
            role="group"
            aria-label="Confirm strategy removal"
            className="border-destructive/40 space-y-3 rounded-lg border p-4"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) {
                event.stopPropagation();
                setConfirming(false);
                setError("");
              }
            }}
          >
            <p className="text-sm">
              Remove this strategy? The campaign and its activities will remain.
            </p>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                ref={confirmRef}
                type="button"
                variant="destructive"
                onClick={() => void remove()}
                disabled={busy}
              >
                {busy ? "Removing…" : "Confirm removal"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      {announcement && (
        <p role="status" aria-live="polite" className="text-sm">
          {announcement}
        </p>
      )}
    </section>
  );
}
