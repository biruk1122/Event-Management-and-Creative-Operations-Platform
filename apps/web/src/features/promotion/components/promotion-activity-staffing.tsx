"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { PromotionActivity } from "../promotion-types";

const CONTROL_CLASS =
  "border-input bg-background text-foreground focus-visible:ring-ring min-h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

export interface PromotionActivityStaffingProps {
  activity: PromotionActivity;
  /** Whether the viewer may change this activity (the campaign's own department). */
  canManage: boolean;
  /** Active employees of the campaign's department, to choose from. */
  employees: readonly { id: string; name: string }[];
  employeesUnavailable?: boolean;
  disabled?: boolean;
  onSaveDetails: (values: {
    location: string | null;
    requiredResources: string | null;
  }) => Promise<void>;
  onAssign: (employeeId: string) => Promise<void>;
  onUnassign: (employeeId: string) => Promise<void>;
}

/**
 * Where an activity happens, what it needs, and who works it (EVE-231). Only
 * active employees of the campaign's department can be assigned; the server
 * refuses anyone else, and the choices here are only a convenience.
 */
export function PromotionActivityStaffing({
  activity,
  canManage,
  employees,
  employeesUnavailable = false,
  disabled = false,
  onSaveDetails,
  onAssign,
  onUnassign,
}: PromotionActivityStaffingProps) {
  const ids = {
    location: useId(),
    resources: useId(),
    employee: useId(),
  };
  const [location, setLocation] = useState(activity.location ?? "");
  const [resources, setResources] = useState(activity.requiredResources ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState("");

  const assigned = new Set(activity.assignees.map((person) => person.id));
  const choices = employees.filter((person) => !assigned.has(person.id));

  async function save() {
    setError("");
    try {
      await onSaveDetails({
        location: location.trim() === "" ? null : location.trim(),
        requiredResources: resources.trim() === "" ? null : resources.trim(),
      });
    } catch {
      setError("The location and resources could not be saved. Try again.");
    }
  }

  async function assign() {
    if (!employeeId) return;
    setError("");
    try {
      await onAssign(employeeId);
      setEmployeeId("");
    } catch {
      setError("That person could not be assigned. Refresh and try again.");
    }
  }

  async function unassign(id: string) {
    setError("");
    try {
      await onUnassign(id);
    } catch {
      setError("That person could not be removed. Refresh and try again.");
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        aria-label="Activity location and resources"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={ids.location}>Location</Label>
          <Input
            id={ids.location}
            value={location}
            maxLength={500}
            disabled={!canManage || disabled}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.resources}>Required resources</Label>
          <textarea
            id={ids.resources}
            rows={2}
            maxLength={2000}
            value={resources}
            disabled={!canManage || disabled}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
            onChange={(event) => setResources(event.target.value)}
          />
        </div>
        {canManage ? (
          <Button type="submit" size="sm" disabled={disabled}>
            Save details
          </Button>
        ) : null}
      </form>

      <div className="space-y-2">
        <h4 className="font-medium">Assigned people</h4>
        {activity.assignees.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No one is assigned yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {activity.assignees.map((person) => (
              <li
                key={person.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{person.firstName ?? person.email}</span>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-label={`Remove ${person.firstName ?? person.email} from this activity`}
                    onClick={() => void unassign(person.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          employeesUnavailable ? (
            <p className="text-muted-foreground text-sm">
              People in the department could not be listed. Try again later.
            </p>
          ) : choices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Everyone in the department is already assigned.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor={ids.employee}>Add a department member</Label>
                <select
                  id={ids.employee}
                  className={CONTROL_CLASS}
                  value={employeeId}
                  disabled={disabled}
                  onChange={(event) => setEmployeeId(event.target.value)}
                >
                  <option value="">Choose a person…</option>
                  {choices.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={disabled || !employeeId}
                onClick={() => void assign()}
              >
                Assign
              </Button>
            </div>
          )
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
