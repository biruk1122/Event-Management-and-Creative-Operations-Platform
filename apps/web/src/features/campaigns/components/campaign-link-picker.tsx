"use client";

import { useEffect, useId, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserApi } from "@/lib/api/browser";
import { listProductions } from "@/features/productions/api/productions-gateway";
import { listProjects } from "@/features/projects/api/projects-gateway";

import type { RelatedLinkKind } from "../lib/campaigns-form";

const KIND_LABELS: Record<RelatedLinkKind, string> = {
  NONE: "Nothing",
  PROJECT: "A project",
  PRODUCTION: "A production",
  ARTIST: "An artist",
};

const KINDS: readonly RelatedLinkKind[] = [
  "NONE",
  "PROJECT",
  "PRODUCTION",
  "ARTIST",
];

type LinkOption = { id: string; name: string };

/**
 * Loads the choices for one kind of link. Only the chosen kind is fetched, and
 * only the first page: the picker is for a single related record, not a browser.
 * A plain effect keeps the picker usable wherever the campaign form renders,
 * with or without a query provider.
 */
function useLinkOptions(kind: RelatedLinkKind): {
  options: LinkOption[];
  pending: boolean;
  failed: boolean;
} {
  // The result is tagged with the kind it was loaded for. A stale result for a
  // previous kind is ignored, so the effect never has to reset state itself.
  const [result, setResult] = useState<{
    kind: RelatedLinkKind;
    options: LinkOption[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (kind === "NONE") return;
    const controller = new AbortController();
    loadLinkOptions(kind, controller.signal).then(
      (options) => {
        if (!controller.signal.aborted)
          setResult({ kind, options, failed: false });
      },
      () => {
        if (!controller.signal.aborted)
          setResult({ kind, options: [], failed: true });
      },
    );
    return () => controller.abort();
  }, [kind]);

  if (kind === "NONE") return { options: [], pending: false, failed: false };
  const current = result && result.kind === kind ? result : null;
  return {
    options: current?.options ?? [],
    pending: current === null,
    failed: current?.failed ?? false,
  };
}

async function loadLinkOptions(
  kind: Exclude<RelatedLinkKind, "NONE">,
  signal: AbortSignal,
): Promise<LinkOption[]> {
  if (kind === "PROJECT") {
    const page = await listProjects({ page: 1, pageSize: 50 }, signal);
    return page.items.map(({ id, name }) => ({ id, name }));
  }
  if (kind === "PRODUCTION") {
    const page = await listProductions({ page: 1, pageSize: 50 }, signal);
    return page.items.map(({ id, name }) => ({ id, name }));
  }
  const { data } = await browserApi.GET("/api/v1/talents", {
    params: { query: { page: 1, pageSize: 50 } as never },
    signal,
    cache: "no-store",
  });
  return (data?.items ?? []).map(({ id, fullName }) => ({
    id,
    name: fullName,
  }));
}

/**
 * One related project, production or artist (EVE-231). The API allows at most
 * one of the three, so the picker is a kind plus a single record.
 */
export function CampaignLinkPicker({
  kind,
  linkId,
  error,
  disabled,
  onKindChange,
  onLinkChange,
}: {
  kind: RelatedLinkKind;
  linkId: string | null;
  error?: string | undefined;
  disabled?: boolean | undefined;
  onKindChange: (kind: RelatedLinkKind) => void;
  onLinkChange: (id: string | null) => void;
}) {
  const ids = { kind: useId(), item: useId() };
  const { options: choices, pending, failed } = useLinkOptions(kind);

  return (
    <div className="space-y-2">
      <Label htmlFor={ids.kind}>Promotes (optional)</Label>
      <Select
        value={kind}
        disabled={disabled ?? false}
        onValueChange={(value) => {
          const next = value as RelatedLinkKind;
          onKindChange(next);
          onLinkChange(null);
        }}
      >
        <SelectTrigger id={ids.kind}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((item) => (
            <SelectItem key={item} value={item}>
              {KIND_LABELS[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {kind !== "NONE" ? (
        <div className="space-y-2">
          <Label htmlFor={ids.item} className="sr-only">
            {KIND_LABELS[kind]}
          </Label>
          <Select
            value={linkId ?? ""}
            disabled={disabled ?? false}
            onValueChange={(value) => onLinkChange(value)}
          >
            <SelectTrigger
              id={ids.item}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids.item}-error` : undefined}
            >
              <SelectValue
                placeholder={
                  pending
                    ? "Loading…"
                    : `Choose ${KIND_LABELS[kind].toLowerCase()}…`
                }
              />
            </SelectTrigger>
            <SelectContent>
              {choices.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {failed ? (
            <p className="text-muted-foreground text-xs">
              Choices could not be loaded. Try again later.
            </p>
          ) : null}
          {error ? (
            <p id={`${ids.item}-error`} className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
