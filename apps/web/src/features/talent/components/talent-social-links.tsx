"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  AddSocialLink,
  RemoveSocialLink,
  TalentSocialLinkValues,
} from "../lib/talent-outcome";
import type { Talent, TalentSocialLink } from "../lib/talent-types";

const ACTION_ERRORS: Record<string, string> = {
  conflict: "That URL is already recorded for this talent.",
  not_found: "This social link no longer exists. Refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

const EMPTY_VALUES: TalentSocialLinkValues = { label: "", url: "" };

interface TalentSocialLinksProps {
  talentId: string;
  socialLinks: readonly TalentSocialLink[];
  /** Social links share `talent.update` with the profile fields. */
  canManage: boolean;
  onAdd: AddSocialLink;
  onRemove: RemoveSocialLink;
  onChanged: (talent: Talent) => void;
  /**
   * Called after a successful removal, since `DELETE .../social-links/:id`
   * returns no body (unlike add, which returns the full talent) - the caller
   * has nothing to `onChanged` with, so it must update its own state.
   */
  onRemoved: (socialLinkId: string) => void;
}

/**
 * A talent's social links. There is no update route - only add and remove -
 * so editing means removing and re-adding.
 */
export function TalentSocialLinks({
  talentId,
  socialLinks,
  canManage,
  onAdd,
  onRemove,
  onChanged,
  onRemoved,
}: TalentSocialLinksProps) {
  const headingId = useId();
  const ids = { label: useId(), url: useId() };
  const labelRef = useRef<HTMLInputElement>(null);

  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<TalentSocialLinkValues>(EMPTY_VALUES);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (adding) labelRef.current?.focus();
  }, [adding]);

  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setLabelError(null);
    setUrlError(null);

    let invalid = false;
    if (values.label.trim() === "") {
      setLabelError("Enter a label.");
      invalid = true;
    }
    if (values.url.trim() === "") {
      setUrlError("Enter a URL.");
      invalid = true;
    }
    if (invalid) return;

    setAddBusy(true);
    const outcome = await onAdd(talentId, values);
    setAddBusy(false);

    if (outcome.status === "success") {
      onChanged(outcome.talent);
      setValues(EMPTY_VALUES);
      setAdding(false);
      setAnnouncement("Social link added.");
      return;
    }
    if (outcome.status === "field_errors") {
      if (outcome.fieldErrors.label) setLabelError(outcome.fieldErrors.label);
      if (outcome.fieldErrors.url) setUrlError(outcome.fieldErrors.url);
      return;
    }
    if (outcome.status === "conflict") {
      setUrlError(actionError("conflict"));
      return;
    }
    setFormError(actionError(outcome.status));
  }

  async function remove(link: TalentSocialLink) {
    setBusyId(link.id);
    setRowError(null);
    const outcome = await onRemove(talentId, link.id);
    setBusyId(null);
    if (outcome.status === "success") {
      onRemoved(link.id);
      setAnnouncement(`${link.label} removed.`);
      return;
    }
    setRowError({ id: link.id, message: actionError(outcome.status) });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="border-border space-y-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={headingId} className="text-sm font-medium">
          Social links
        </p>
        {!adding && canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add social link
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form
          aria-label="Add social link"
          noValidate
          className="border-border bg-muted/30 space-y-3 rounded-lg border p-3"
          onSubmit={(event) => void submitAdd(event)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={ids.label}>Label</Label>
              <Input
                id={ids.label}
                ref={labelRef}
                value={values.label}
                disabled={addBusy}
                placeholder="Instagram"
                aria-invalid={labelError ? true : undefined}
                aria-describedby={labelError ? `${ids.label}-error` : undefined}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
              {labelError ? (
                <p
                  id={`${ids.label}-error`}
                  className="text-destructive text-sm"
                >
                  {labelError}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.url}>URL</Label>
              <Input
                id={ids.url}
                type="url"
                value={values.url}
                disabled={addBusy}
                placeholder="https://instagram.com/…"
                aria-invalid={urlError ? true : undefined}
                aria-describedby={urlError ? `${ids.url}-error` : undefined}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
              />
              {urlError ? (
                <p id={`${ids.url}-error`} className="text-destructive text-sm">
                  {urlError}
                </p>
              ) : null}
            </div>
          </div>
          {formError ? (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={addBusy}
              aria-busy={addBusy}
            >
              {addBusy ? "Adding…" : "Add link"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={addBusy}
              onClick={() => {
                setAdding(false);
                setValues(EMPTY_VALUES);
                setLabelError(null);
                setUrlError(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {socialLinks.length === 0 && !adding ? (
        <p className="text-muted-foreground text-sm">
          {canManage
            ? "No social links yet. Add the first one."
            : "No social links yet."}
        </p>
      ) : null}

      <ul className="space-y-2">
        {socialLinks.map((link) => (
          <li
            key={link.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              <span className="font-medium">{link.label}</span>{" "}
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground underline underline-offset-4"
              >
                {link.url}
              </a>
            </span>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyId === link.id}
                aria-label={`Remove ${link.label}`}
                onClick={() => void remove(link)}
              >
                {busyId === link.id ? "Working…" : "Remove"}
              </Button>
            ) : null}
            {rowError?.id === link.id ? (
              <p className="text-destructive w-full text-sm" role="alert">
                {rowError.message}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
