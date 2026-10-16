"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
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

import {
  TASK_TYPES,
  personName,
  taskTypeLabel,
  type Task,
  type TaskPerson,
  type TaskType,
} from "../lib/tasks-types";

export interface AssignableDepartment {
  id: string;
  name: string;
}

export interface CreateTaskValues {
  title: string;
  description: string;
  type: TaskType;
  departmentId: string;
  assigneeId: string;
  dueAt: string;
  workspaceId?: string;
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Super Admin sees every department; Department Manager sees only their
   * own - the server re-validates this regardless of what is offered here. */
  departments: readonly AssignableDepartment[];
  /** True for a Department Manager: the field is shown but not editable. */
  departmentLocked: boolean;
  /** When set, every created task is also linked to this connected
   * workspace (e.g. a production's schedule) - silent context, not a field
   * the user picks. */
  workspaceId?: string;
  loadEligibleAssignees: (
    departmentId: string,
    signal?: AbortSignal,
  ) => Promise<TaskPerson[]>;
  onCreate: (values: CreateTaskValues) => Promise<Task>;
  onUploadAttachment: (taskId: string, file: File) => Promise<unknown>;
  onCreated: (task: Task) => void;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

function emptyValues(defaultDepartmentId: string): CreateTaskValues {
  return {
    title: "",
    description: "",
    type: "GENERAL",
    departmentId: defaultDepartmentId,
    assigneeId: "",
    dueAt: "",
  };
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  departments,
  departmentLocked,
  workspaceId,
  loadEligibleAssignees,
  onCreate,
  onUploadAttachment,
  onCreated,
}: CreateTaskDialogProps) {
  const titleId = useId();
  const departmentId = useId();
  const assigneeId = useId();
  const typeId = useId();
  const descriptionId = useId();
  const dueAtId = useId();
  const fileId = useId();

  const defaultDepartmentId =
    departmentLocked && departments[0] ? departments[0].id : "";
  const [values, setValues] = useState<CreateTaskValues>(() =>
    emptyValues(defaultDepartmentId),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CreateTaskValues, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  const assignees = useQuery({
    queryKey: ["create-task-eligible-assignees", values.departmentId],
    queryFn: ({ signal }) => loadEligibleAssignees(values.departmentId, signal),
    enabled: open && values.departmentId !== "",
    retry: false,
    staleTime: 30_000,
  });

  function reset() {
    setValues(emptyValues(defaultDepartmentId));
    setFiles([]);
    setFieldErrors({});
    setFormError(null);
    setAttachmentWarning(null);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function changeDepartment(nextDepartmentId: string) {
    setValues((current) => ({
      ...current,
      departmentId: nextDepartmentId,
      // The eligible-assignee list depends on the department, so a prior
      // selection from a different department must not silently survive.
      assigneeId: "",
    }));
  }

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const next: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(selected)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} (larger than 25 MB)`);
        continue;
      }
      if (
        ALLOWED_ATTACHMENT_TYPES.size > 0 &&
        file.type &&
        !ALLOWED_ATTACHMENT_TYPES.has(file.type)
      ) {
        rejected.push(`${file.name} (unsupported file type)`);
        continue;
      }
      next.push(file);
    }
    if (rejected.length > 0) {
      setAttachmentWarning(`Not added: ${rejected.join(", ")}.`);
    }
    if (next.length > 0) {
      setFiles((current) => [...current, ...next]);
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    const localErrors: Partial<Record<keyof CreateTaskValues, string>> = {};
    if (values.title.trim() === "") localErrors.title = "Enter a task name.";
    if (values.departmentId === "")
      localErrors.departmentId = "Choose a department.";
    if (values.assigneeId === "")
      localErrors.assigneeId = "Choose who this task is assigned to.";
    if (values.description.trim() === "")
      localErrors.description = "Enter a description.";
    if (values.dueAt === "") localErrors.dueAt = "Choose a target date.";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setAttachmentWarning(null);
    try {
      const task = await onCreate({
        ...values,
        dueAt: new Date(`${values.dueAt}T00:00:00.000Z`).toISOString(),
        ...(workspaceId ? { workspaceId } : {}),
      });
      if (files.length > 0) {
        const failed: string[] = [];
        for (const file of files) {
          try {
            await onUploadAttachment(task.id, file);
          } catch {
            failed.push(file.name);
          }
        }
        if (failed.length > 0) {
          setAttachmentWarning(
            `The task was created, but these files did not upload: ${failed.join(", ")}. Open the task to retry.`,
          );
        }
      }
      onCreated(task);
      close();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The task could not be created. Your entries are still here; try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const assigneeOptions: readonly TaskPerson[] = assignees.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Create and assign a task to an eligible member of the chosen
            department.
          </DialogDescription>
        </DialogHeader>

        <form
          aria-label="Create task"
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
        >
          {formError ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          ) : null}
          {attachmentWarning ? (
            <Alert aria-live="polite">
              <AlertTitle>{attachmentWarning}</AlertTitle>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={titleId}>
              Task name <span aria-hidden="true">*</span>
            </Label>
            <Input
              id={titleId}
              value={values.title}
              disabled={submitting}
              aria-required="true"
              aria-invalid={fieldErrors.title ? true : undefined}
              aria-describedby={
                fieldErrors.title ? `${titleId}-error` : undefined
              }
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            {fieldErrors.title ? (
              <p id={`${titleId}-error`} className="text-destructive text-sm">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={departmentId}>
                Department <span aria-hidden="true">*</span>
              </Label>
              <Select
                value={values.departmentId}
                disabled={submitting || departmentLocked}
                onValueChange={changeDepartment}
              >
                <SelectTrigger
                  id={departmentId}
                  aria-invalid={fieldErrors.departmentId ? true : undefined}
                >
                  <SelectValue placeholder="Choose a department…" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.departmentId ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.departmentId}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={assigneeId}>
                Assigned person <span aria-hidden="true">*</span>
              </Label>
              <Select
                value={values.assigneeId}
                disabled={submitting || values.departmentId === ""}
                onValueChange={(value) =>
                  setValues((current) => ({ ...current, assigneeId: value }))
                }
              >
                <SelectTrigger
                  id={assigneeId}
                  aria-invalid={fieldErrors.assigneeId ? true : undefined}
                >
                  <SelectValue
                    placeholder={
                      values.departmentId === ""
                        ? "Choose a department first…"
                        : assignees.isPending
                          ? "Loading…"
                          : "Choose a person…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {personName(person)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {values.departmentId !== "" &&
              !assignees.isPending &&
              !assignees.isError &&
              assigneeOptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No eligible people in this department yet.
                </p>
              ) : null}
              {assignees.isError ? (
                <p className="text-destructive text-sm">
                  The department roster could not be loaded.
                </p>
              ) : null}
              {fieldErrors.assigneeId ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.assigneeId}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={typeId}>
                Task type <span aria-hidden="true">*</span>
              </Label>
              <Select
                value={values.type}
                disabled={submitting}
                onValueChange={(value) =>
                  setValues((current) => ({
                    ...current,
                    type: value as TaskType,
                  }))
                }
              >
                <SelectTrigger id={typeId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {taskTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={dueAtId}>
                Target date <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={dueAtId}
                type="date"
                value={values.dueAt}
                disabled={submitting}
                aria-invalid={fieldErrors.dueAt ? true : undefined}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
              {fieldErrors.dueAt ? (
                <p className="text-destructive text-sm">{fieldErrors.dueAt}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={descriptionId}>
              Description <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={descriptionId}
              value={values.description}
              disabled={submitting}
              aria-invalid={fieldErrors.description ? true : undefined}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
            {fieldErrors.description ? (
              <p className="text-destructive text-sm">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fileId}>Attachments</Label>
            <Input
              id={fileId}
              type="file"
              multiple
              disabled={submitting}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {files.length > 0 ? (
              <ul className="divide-border mt-2 divide-y rounded-lg border">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 p-2 text-sm"
                  >
                    <span data-file-name className="min-w-0 truncate">
                      {file.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={submitting}
                      onClick={() => removeFile(index)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
