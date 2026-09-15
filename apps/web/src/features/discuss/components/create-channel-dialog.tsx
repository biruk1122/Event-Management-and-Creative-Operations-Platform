"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

import type {
  ChannelOwnerOptions,
  ListChannelOwners,
} from "../api/list-channel-owners";
import type {
  CreateChannel,
  CreateChannelValues,
} from "../lib/discuss-outcome";
import type { ChannelVisibility, Conversation } from "../lib/discuss-types";

const OWNER_KINDS = ["GENERAL", "WORKSPACE", "DEPARTMENT", "TEAM"] as const;
type OwnerKind = (typeof OWNER_KINDS)[number];

const OWNER_KIND_LABELS: Record<OwnerKind, string> = {
  GENERAL: "General (no owner)",
  WORKSPACE: "An event, project, or campaign",
  DEPARTMENT: "A department",
  TEAM: "A team",
};

const FORM_ERRORS: Record<string, string> = {
  owner_invalid: "A channel may have at most one owner.",
  workspace_not_found: "That event, project, or campaign no longer exists.",
  department_not_found: "That department no longer exists.",
  team_not_found: "That team no longer exists.",
  permission_denied: "You do not have permission to create a channel there.",
  unexpected: "We could not create the channel. Try again.",
};

const EMPTY: CreateChannelValues = {
  name: "",
  visibility: "PUBLIC",
  workspaceId: null,
  departmentId: null,
  teamId: null,
};

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listChannelOwners: ListChannelOwners;
  onCreate: CreateChannel;
  onCreated: (conversation: Conversation) => void;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  listChannelOwners,
  onCreate,
  onCreated,
}: CreateChannelDialogProps) {
  const ids = { name: useId(), visibility: useId(), owner: useId() };
  const [values, setValues] = useState<CreateChannelValues>(EMPTY);
  const [ownerKind, setOwnerKind] = useState<OwnerKind>("GENERAL");
  const [options, setOptions] = useState<ChannelOwnerOptions>({
    workspaces: [],
    departments: [],
    teams: [],
  });
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateChannelValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listChannelOwners().then(setOptions);
  }, [open, listChannelOwners]);

  function reset() {
    setValues(EMPTY);
    setOwnerKind("GENERAL");
    setFieldErrors({});
    setFormError(null);
  }

  function set<K extends keyof CreateChannelValues>(
    key: K,
    value: CreateChannelValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function ownerListFor(kind: OwnerKind) {
    if (kind === "WORKSPACE") return options.workspaces;
    if (kind === "DEPARTMENT") return options.departments;
    if (kind === "TEAM") return options.teams;
    return [];
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    const outcome = await onCreate(values);
    setSubmitting(false);

    switch (outcome.status) {
      case "success":
        onCreated(outcome.conversation);
        reset();
        onOpenChange(false);
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
          <DialogDescription>
            Name the channel, choose who can see it, and optionally tie it to a
            workspace, department, or team.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create channel"
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={ids.name}>Name</Label>
            <Input
              id={ids.name}
              autoFocus
              required
              maxLength={100}
              value={values.name}
              aria-invalid={fieldErrors.name ? true : undefined}
              onChange={(event) => set("name", event.target.value)}
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.visibility}>Visibility</Label>
            <Select
              value={values.visibility}
              onValueChange={(value) =>
                set("visibility", value as ChannelVisibility)
              }
            >
              <SelectTrigger id={ids.visibility}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public - anyone can join</SelectItem>
                <SelectItem value="PRIVATE">
                  Private - membership by invitation
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.owner}>Owner</Label>
            <Select
              value={ownerKind}
              onValueChange={(value) => {
                const kind = value as OwnerKind;
                setOwnerKind(kind);
                set("workspaceId", null);
                set("departmentId", null);
                set("teamId", null);
              }}
            >
              <SelectTrigger id={ids.owner}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OWNER_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {OWNER_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ownerKind !== "GENERAL" ? (
            <div className="space-y-2">
              <Label htmlFor={`${ids.owner}-record`}>
                {OWNER_KIND_LABELS[ownerKind]}
              </Label>
              <Select
                onValueChange={(value) => {
                  if (ownerKind === "WORKSPACE") set("workspaceId", value);
                  if (ownerKind === "DEPARTMENT") set("departmentId", value);
                  if (ownerKind === "TEAM") set("teamId", value);
                }}
              >
                <SelectTrigger id={`${ids.owner}-record`}>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {ownerListFor(ownerKind).map((record) => (
                    <SelectItem key={record.id} value={record.id}>
                      {record.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(fieldErrors.workspaceId ??
              fieldErrors.departmentId ??
              fieldErrors.teamId) ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.workspaceId ??
                    fieldErrors.departmentId ??
                    fieldErrors.teamId}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
