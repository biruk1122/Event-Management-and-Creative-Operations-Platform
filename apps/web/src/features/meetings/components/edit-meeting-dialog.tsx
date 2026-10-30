"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WorkDialogContent } from "@/components/ui/work-dialog-content";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Meeting, UpdateMeetingInput } from "../api/meetings-gateway";

/** datetime-local uses the browser's zone; the API continues to receive UTC. */
function localDateTime(value: string) {
  const date = new Date(value);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

export function EditMeetingDialog({
  meeting,
  onSave,
}: {
  meeting: Meeting;
  onSave: (input: UpdateMeetingInput) => Promise<Meeting>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(meeting.type);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const start = new Date(value("startAt"));
    const end = new Date(value("endAt"));
    const reminder = value("reminderAt") ? new Date(value("reminderAt")) : null;
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
    if (type !== "ONLINE" && !value("location")) {
      setError("Enter the meeting location.");
      return;
    }
    if (
      reminder &&
      (!Number.isFinite(reminder.getTime()) || reminder > start)
    ) {
      setError(
        "Set the reminder at or before the meeting start time, or clear it.",
      );
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      await onSave({
        title: value("title"),
        description: value("description") || null,
        type,
        location: type === "ONLINE" ? null : value("location"),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        reminderAt: reminder?.toISOString() ?? null,
      });
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the meeting. Try again.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting.current) return;
        if (next) {
          setType(meeting.type);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil aria-hidden="true" />
          Edit meeting
        </Button>
      </DialogTrigger>
      <WorkDialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Edit meeting</DialogTitle>
          <DialogDescription>
            Update the meeting details. Times use your browser’s local time
            zone.
          </DialogDescription>
        </DialogHeader>
        <form
          aria-label="Edit meeting"
          onSubmit={(event) => void submit(event)}
          className="min-w-0 space-y-4"
          aria-busy={pending}
        >
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`}>Meeting title</Label>
              <Input
                id={`${id}-title`}
                name="title"
                required
                maxLength={200}
                defaultValue={meeting.title}
              />
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${id}-start`}>Start time</Label>
                <Input
                  id={`${id}-start`}
                  name="startAt"
                  type="datetime-local"
                  step="1"
                  required
                  defaultValue={localDateTime(meeting.startAt)}
                  className="min-w-0"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${id}-end`}>End time</Label>
                <Input
                  id={`${id}-end`}
                  name="endAt"
                  type="datetime-local"
                  step="1"
                  required
                  defaultValue={localDateTime(meeting.endAt)}
                  className="min-w-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-type`}>Meeting type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as Meeting["type"])}
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
            {type !== "ONLINE" ? (
              <div className="space-y-2">
                <Label htmlFor={`${id}-location`}>Location</Label>
                <Input
                  id={`${id}-location`}
                  name="location"
                  required
                  maxLength={500}
                  defaultValue={meeting.location ?? ""}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor={`${id}-reminder`}>Reminder (optional)</Label>
              <Input
                id={`${id}-reminder`}
                name="reminderAt"
                type="datetime-local"
                step="1"
                defaultValue={
                  meeting.reminderAt ? localDateTime(meeting.reminderAt) : ""
                }
                className="min-w-0"
              />
              <p className="text-muted-foreground text-xs">
                At or before the start time. Clear this field to turn the
                reminder off.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>
                Description (optional)
              </Label>
              <Textarea
                id={`${id}-description`}
                name="description"
                rows={3}
                maxLength={4000}
                defaultValue={meeting.description ?? ""}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </WorkDialogContent>
    </Dialog>
  );
}
