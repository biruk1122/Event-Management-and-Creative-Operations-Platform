"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AssignableMeetingPerson,
  CreateMeetingInput,
  Meeting,
} from "../api/meetings-gateway";

function personName(person: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return name || person.email;
}

/** A searchable, chip-based multi-select for the participant list - no
 * existing combobox primitive exists in this codebase to reuse (confirmed
 * before building this), so it's composed from `Input` + a lightweight,
 * dependency-free filtered dropdown, following the same plain-HTML-first
 * style already used elsewhere (no new library, no Radix Popover wiring). */
function ParticipantPicker({
  id,
  people,
  selectedIds,
  onToggle,
  unavailable,
}: {
  id: string;
  people: AssignableMeetingPerson[];
  selectedIds: string[];
  onToggle: (personId: string, selected: boolean) => void;
  unavailable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => people.filter((person) => selectedIds.includes(person.id)),
    [people, selectedIds],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      if (selectedIds.includes(person.id)) return false;
      if (!needle) return true;
      return (
        personName(person).toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle)
      );
    });
  }, [people, selectedIds, query]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Participants (optional)</Label>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((person) => (
            <Badge
              key={person.id}
              variant="secondary"
              className="gap-1 py-1 pr-1 pl-2 font-normal"
            >
              {personName(person)}
              <button
                type="button"
                onClick={() => onToggle(person.id, false)}
                aria-label={`Remove ${personName(person)}`}
                className="hover:bg-foreground/10 rounded-full p-0.5"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      {unavailable ? (
        <p className="text-muted-foreground text-xs">
          The user directory is unavailable for your role.
        </p>
      ) : (
        <div className="relative">
          <Input
            id={id}
            type="text"
            autoComplete="off"
            placeholder="Search people by name or email…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          />
          {open ? (
            <div
              className="bg-popover text-popover-foreground absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border p-1 shadow-md"
              // Keeps the input focused when a result is clicked, so the
              // click's onClick still fires before any blur-driven close.
              onMouseDown={(event) => event.preventDefault()}
            >
              {filtered.length > 0 ? (
                <ul>
                  {filtered.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        aria-label={personName(person)}
                        className="hover:bg-muted flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm"
                        onClick={() => {
                          onToggle(person.id, true);
                          setQuery("");
                        }}
                      >
                        <span aria-hidden="true">{personName(person)}</span>
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground text-xs"
                        >
                          {person.email}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground px-2 py-1.5 text-sm">
                  {people.length === 0 ? "No people available." : "No matches."}
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function CreateMeetingForm({
  onCreate,
  onCreated,
  onCancel,
  people,
  peopleUnavailable = false,
}: {
  onCreate: (input: CreateMeetingInput) => Promise<Meeting>;
  onCreated: (meeting: Meeting) => void;
  onCancel: () => void;
  /** Candidates for the participant picker (the current user already
   * excluded) - empty while loading or when there's simply no one else to
   * invite. */
  people: AssignableMeetingPerson[];
  /** True when the organizer's role cannot browse the user directory at
   * all (no `user.read` grant - e.g. a Department Manager) - shows an
   * explanatory message instead of an always-empty picker. */
  peopleUnavailable?: boolean;
}) {
  const id = useId();
  const [type, setType] = useState<CreateMeetingInput["type"]>("PHYSICAL");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const needsLocation = type !== "ONLINE";

  function toggleParticipant(personId: string, checked: boolean) {
    setParticipantIds((current) =>
      checked
        ? [...current, personId]
        : current.filter((candidateId) => candidateId !== personId),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const start = new Date(value("startAt"));
    const end = new Date(value("endAt"));
    setError(null);
    if (
      !value("title") ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      setError("Enter a title and an end time after the start time.");
      return;
    }
    if (needsLocation && !value("location")) {
      setError("Enter the meeting location.");
      return;
    }
    setPending(true);
    try {
      const meeting = await onCreate({
        title: value("title"),
        type,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        ...(value("description") ? { description: value("description") } : {}),
        ...(needsLocation ? { location: value("location") } : {}),
        participantIds,
      });
      onCreated(meeting);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the meeting. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-label="Create meeting"
      onSubmit={(event) => void submit(event)}
      className="bg-card space-y-3 rounded-xl border p-4 sm:p-5"
    >
      <div>
        <h2 className="text-base font-semibold">New meeting</h2>
        <p className="text-muted-foreground text-xs">
          You will be the organizer. Times use your browser’s local time zone.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <fieldset disabled={pending} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-title`}>Meeting title</Label>
          <Input id={`${id}-title`} name="title" required maxLength={200} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-start`}>Start time</Label>
            <Input
              id={`${id}-start`}
              name="startAt"
              type="datetime-local"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-end`}>End time</Label>
            <Input
              id={`${id}-end`}
              name="endAt"
              type="datetime-local"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-type`}>Meeting type</Label>
            <Select
              value={type}
              onValueChange={(value) =>
                setType(value as CreateMeetingInput["type"])
              }
            >
              <SelectTrigger id={`${id}-type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHYSICAL">In person</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="HYBRID">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {needsLocation ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-location`}>Location</Label>
            <Input
              id={`${id}-location`}
              name="location"
              required
              maxLength={500}
            />
          </div>
        ) : null}
        {type !== "PHYSICAL" ? (
          <p className="text-muted-foreground text-xs">
            Lela creates a self-hosted Jitsi video room for this meeting
            automatically - no separate link to generate or paste.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-description`}>Description (optional)</Label>
          <Textarea
            id={`${id}-description`}
            name="description"
            rows={3}
            maxLength={4000}
          />
        </div>
        <ParticipantPicker
          id={`${id}-participant-search`}
          people={people}
          selectedIds={participantIds}
          onToggle={toggleParticipant}
          unavailable={peopleUnavailable}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit">
            {pending ? "Creating…" : "Create meeting"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
