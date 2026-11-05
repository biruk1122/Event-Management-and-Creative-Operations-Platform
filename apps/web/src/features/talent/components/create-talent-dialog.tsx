"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdministrationDialogContent as DialogContent } from "@/components/ui/administration-dialog-content";
import { cn } from "@/lib/utils";

import {
  EMPTY_FIELDS,
  validateFields,
  validateSocialLink,
  type TalentFieldErrors,
  type TalentFieldValues,
} from "../lib/talent-form";
import type { CreateTalent, StartingStatus } from "../lib/talent-outcome";
import {
  personName,
  STARTING_STATUS_OPTIONS,
  TALENT_TYPE_LABELS,
  TALENT_TYPES,
  type AssignableUser,
  type Talent,
  type TalentType,
} from "../lib/talent-types";

const NO_MANAGER = "NONE";
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const PHOTO_ACCEPT = PHOTO_TYPES.join(",");

const STATUS_DOT: Record<StartingStatus, string> = {
  AVAILABLE: "bg-primary",
  UNAVAILABLE: "bg-muted-foreground",
  INACTIVE: "bg-destructive",
};

const FORM_ERRORS: Record<string, string> = {
  manager_not_found: "That user no longer exists. Pick another.",
  permission_denied: "You do not have permission to create a talent profile.",
  unexpected: "We could not create the talent profile. Try again.",
};

const TEXTAREA_CLASS =
  "border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The name shown for a social link typed as one address: its host, without
 * "www.", so "https://www.instagram.com/x" is saved as "instagram.com".
 */
function linkNameFor(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "") || "Link";
  } catch {
    return "Link";
  }
}

interface CreateTalentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: readonly AssignableUser[];
  onCreate: CreateTalent;
  /** Attaches the chosen photo to the new profile. Resolves `false` when the upload fails. */
  onUploadPhoto: (talentId: string, file: File) => Promise<boolean>;
  /** Called once the profile exists. `notice` explains a partial success, such as a photo that did not upload. */
  onCreated: (talent: Talent, notice: string | null) => void;
}

export function CreateTalentDialog({
  open,
  onOpenChange,
  managers,
  onCreate,
  onUploadPhoto,
  onCreated,
}: CreateTalentDialogProps) {
  const formId = useId();
  const ids = {
    fullName: useId(),
    type: useId(),
    email: useId(),
    phone: useId(),
    social: useId(),
    manager: useId(),
    biography: useId(),
    status: useId(),
  };

  const [values, setValues] = useState<TalentFieldValues>(EMPTY_FIELDS);
  const [status, setStatus] = useState<StartingStatus>("AVAILABLE");
  const [managerValue, setManagerValue] = useState<string | null>(null);
  const [socialUrl, setSocialUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TalentFieldErrors>({});
  const [socialError, setSocialError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const previewUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function reset() {
    setValues(EMPTY_FIELDS);
    setStatus("AVAILABLE");
    setManagerValue(null);
    setSocialUrl("");
    setPhoto(null);
    setPhotoError(null);
    setFieldErrors({});
    setSocialError(null);
    setFormError(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function setField<K extends keyof TalentFieldValues>(
    key: K,
    value: TalentFieldValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function pickPhoto(files: File[]) {
    const [next] = files;
    if (!next) return;
    if (!PHOTO_TYPES.includes(next.type as (typeof PHOTO_TYPES)[number])) {
      setPhotoError("Choose a PNG, JPG or WEBP image.");
      return;
    }
    setPhotoError(null);
    setPhoto(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const localErrors = validateFields(values);
    const hasLink = socialUrl.trim() !== "";
    const localSocialErrors = hasLink
      ? validateSocialLink({ label: linkNameFor(socialUrl), url: socialUrl })
      : {};
    setFieldErrors(localErrors);
    setSocialError(localSocialErrors.url ?? null);
    if (Object.keys(localErrors).length > 0 || localSocialErrors.url) return;

    setSubmitting(true);
    const outcome = await onCreate({
      ...values,
      managerId: managerValue,
      availability: status,
      socialLink: hasLink
        ? { label: linkNameFor(socialUrl), url: socialUrl.trim() }
        : null,
    });

    switch (outcome.status) {
      case "success": {
        let notice: string | null = null;
        if (photo) {
          const uploaded = await onUploadPhoto(outcome.talent.id, photo);
          if (!uploaded) {
            notice =
              "Talent created, but the photo did not upload. Add it from the profile.";
          }
        }
        setSubmitting(false);
        onCreated(outcome.talent, notice);
        close();
        return;
      }
      case "field_errors":
        setSubmitting(false);
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setSubmitting(false);
        setFormError(FORM_ERRORS[outcome.status] ?? FORM_ERRORS.unexpected!);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[98vh] max-h-[98vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-[94vw] lg:max-w-300 xl:max-w-340">
        <DialogHeader className="border-border from-accent to-card flex-row items-center justify-between gap-4 border-b bg-linear-to-br px-6 py-5 text-left sm:px-10">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <UserPlus aria-hidden="true" className="size-6" />
            </span>
            <div>
              <DialogTitle className="text-xl">New talent</DialogTitle>
              <DialogDescription>
                Create a creative profile, set its status and add how to reach
                them.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <form
            id={formId}
            aria-label="Create talent"
            className="space-y-8"
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
          >
            {formError ? (
              <Alert variant="destructive" aria-live="assertive">
                <AlertTitle>{formError}</AlertTitle>
              </Alert>
            ) : null}

            <section
              aria-labelledby={`${ids.fullName}-heading`}
              className="border-border bg-muted/30 space-y-4 rounded-2xl border p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  id={`${ids.fullName}-heading`}
                  className="text-sm font-semibold"
                >
                  Talent profile
                </h3>
                <p className="text-muted-foreground text-xs">* Required</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor={ids.fullName}>Full name</Label>
                  <Input
                    id={ids.fullName}
                    value={values.fullName}
                    disabled={submitting}
                    required
                    aria-invalid={fieldErrors.fullName ? true : undefined}
                    aria-describedby={
                      fieldErrors.fullName ? `${ids.fullName}-error` : undefined
                    }
                    onChange={(event) =>
                      setField("fullName", event.target.value)
                    }
                  />
                  {fieldErrors.fullName ? (
                    <p
                      id={`${ids.fullName}-error`}
                      className="text-destructive text-sm"
                    >
                      {fieldErrors.fullName}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={ids.type}>Talent type</Label>
                  <Select
                    value={values.type}
                    disabled={submitting}
                    onValueChange={(value) =>
                      setField("type", value as TalentType)
                    }
                  >
                    <SelectTrigger id={ids.type}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TALENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {TALENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={ids.email}>Email</Label>
                  <Input
                    id={ids.email}
                    type="email"
                    value={values.email}
                    disabled={submitting}
                    aria-invalid={fieldErrors.email ? true : undefined}
                    aria-describedby={
                      fieldErrors.email ? `${ids.email}-error` : undefined
                    }
                    onChange={(event) => setField("email", event.target.value)}
                  />
                  {fieldErrors.email ? (
                    <p
                      id={`${ids.email}-error`}
                      className="text-destructive text-sm"
                    >
                      {fieldErrors.email}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={ids.phone}>Phone</Label>
                  <Input
                    id={ids.phone}
                    value={values.phone}
                    disabled={submitting}
                    aria-invalid={fieldErrors.phone ? true : undefined}
                    aria-describedby={
                      fieldErrors.phone ? `${ids.phone}-error` : undefined
                    }
                    onChange={(event) => setField("phone", event.target.value)}
                  />
                  {fieldErrors.phone ? (
                    <p
                      id={`${ids.phone}-error`}
                      className="text-destructive text-sm"
                    >
                      {fieldErrors.phone}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <fieldset disabled={submitting} className="space-y-3">
              <legend className="text-sm font-semibold">Status</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {STARTING_STATUS_OPTIONS.map((option) => {
                  const checked = status === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "focus-within:ring-ring/50 flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 transition-colors focus-within:ring-3",
                        checked
                          ? "border-primary bg-primary/5 ring-primary ring-1"
                          : "border-border bg-card hover:bg-accent/50",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={ids.status}
                          value={option.value}
                          checked={checked}
                          onChange={() => setStatus(option.value)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-2.5 shrink-0 rounded-full",
                            STATUS_DOT[option.value],
                          )}
                        />
                        <span className="text-sm font-medium">
                          {option.label}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {option.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <section
              aria-label="Representation"
              className="border-border bg-muted/30 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2 sm:p-6"
            >
              <div className="space-y-2">
                <Label htmlFor={ids.social}>Social media links</Label>
                <Input
                  id={ids.social}
                  type="url"
                  placeholder="https://instagram.com/name"
                  value={socialUrl}
                  disabled={submitting}
                  aria-invalid={socialError ? true : undefined}
                  aria-describedby={
                    socialError ? `${ids.social}-error` : undefined
                  }
                  onChange={(event) => setSocialUrl(event.target.value)}
                />
                {socialError ? (
                  <p
                    id={`${ids.social}-error`}
                    className="text-destructive text-sm"
                  >
                    {socialError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor={ids.manager}>Manager</Label>
                <Select
                  value={managerValue ?? NO_MANAGER}
                  disabled={submitting}
                  onValueChange={(value) =>
                    setManagerValue(value === NO_MANAGER ? null : value)
                  }
                >
                  <SelectTrigger id={ids.manager}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MANAGER}>No manager</SelectItem>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {personName(manager)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="border-border bg-muted/30 space-y-2 rounded-2xl border p-5 sm:p-6">
              <Label htmlFor={ids.biography}>Biography</Label>
              <textarea
                id={ids.biography}
                rows={4}
                placeholder="Tell us about this talent's work, style and experience"
                value={values.biography}
                disabled={submitting}
                className={TEXTAREA_CLASS}
                onChange={(event) => setField("biography", event.target.value)}
              />
            </section>

            <section className="border-border bg-muted/30 space-y-3 rounded-2xl border p-5 sm:p-6">
              <h3 className="text-sm font-semibold">Profile photo</h3>
              {previewUrl && photo ? (
                <div className="bg-card border-border flex items-center gap-4 rounded-xl border p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote image */}
                  <img
                    src={previewUrl}
                    alt={`Preview of ${photo.name}`}
                    className="ring-border size-16 shrink-0 rounded-full object-cover ring-2"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{photo.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Uploaded after the profile is saved.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setPhoto(null)}
                  >
                    Remove photo
                  </Button>
                </div>
              ) : null}
              <AttachmentDropzone
                inputLabel="Choose a profile photo"
                disabled={submitting}
                multiple={false}
                accept={PHOTO_ACCEPT}
                hint="PNG, JPG or WEBP"
                onFiles={pickPhoto}
              />
              {photoError ? (
                <p role="alert" className="text-destructive text-sm">
                  {photoError}
                </p>
              ) : null}
            </section>
          </form>
        </div>

        <DialogFooter className="border-border bg-card border-t px-6 py-4 sm:px-10">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={submitting}
            aria-busy={submitting}
          >
            <UserPlus aria-hidden="true" data-icon="inline-start" />
            {submitting ? "Creating…" : "Create talent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
