"use client";

import { RBAC_FAILURE_MESSAGES } from "../lib/rbac-outcome";

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  groupPermissionsByResource,
  matchesQuery,
  resourceLabel,
} from "../lib/group-permissions";
import type { AddGrantOutcome, RemoveGrantOutcome } from "../lib/rbac-outcome";
import {
  PERMISSION_SCOPES,
  SCOPE_LABELS,
  type Permission,
  type PermissionScope,
  type RoleGrant,
} from "../lib/rbac-types";

const TOGGLE_ERRORS: Record<
  | Exclude<AddGrantOutcome["status"], "success">
  | Exclude<RemoveGrantOutcome["status"], "success">,
  string
> = {
  ...RBAC_FAILURE_MESSAGES,
  already_exists: "That grant already exists.",
  not_found: "That grant was already removed.",
  permission_denied:
    "You do not have permission to change grants on this role.",
  unexpected: "We could not save that change. Try again.",
};

function grantKey(permissionKey: string, scope: PermissionScope): string {
  return `${permissionKey}::${scope}`;
}

interface PermissionGrantsEditorProps {
  permissions: readonly Permission[];
  grants: readonly RoleGrant[];
  onAddGrant: (
    permissionKey: string,
    scope: PermissionScope,
  ) => Promise<AddGrantOutcome>;
  onRemoveGrant: (
    permissionKey: string,
    scope: PermissionScope,
  ) => Promise<RemoveGrantOutcome>;
  /** When true, grants are shown but cannot be changed (missing `role.configure_permissions`). */
  readOnly?: boolean;
}

export function PermissionGrantsEditor({
  permissions,
  grants,
  onAddGrant,
  onRemoveGrant,
  readOnly = false,
}: PermissionGrantsEditorProps) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const granted = useMemo(() => {
    const set = new Set<string>();
    for (const grant of grants) {
      set.add(grantKey(grant.permissionKey, grant.scope));
    }
    return set;
  }, [grants]);

  const groups = useMemo(() => {
    const filtered = permissions.filter((permission) =>
      matchesQuery(permission, query),
    );
    return groupPermissionsByResource(filtered);
  }, [permissions, query]);

  async function toggle(permission: Permission, scope: PermissionScope) {
    const key = grantKey(permission.key, scope);
    const isGranted = granted.has(key);

    setError(null);
    setPending((current) => new Set(current).add(key));

    const outcome = isGranted
      ? await onRemoveGrant(permission.key, scope)
      : await onAddGrant(permission.key, scope);

    setPending((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });

    if (outcome.status === "success") {
      setAnnouncement(
        `${isGranted ? "Revoked" : "Granted"} ${permission.key} at ${SCOPE_LABELS[scope]} scope.`,
      );
      return;
    }

    setError(TOGGLE_ERRORS[outcome.status]);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="permission-search">Search permissions</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="permission-search"
            type="search"
            placeholder="Search by key or description"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {readOnly ? (
        <Alert>
          <Lock aria-hidden="true" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            You do not have permission to change grants on this role.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" aria-live="assertive">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {groups.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No permissions match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section
              key={group.resource}
              aria-labelledby={`group-${group.resource}`}
            >
              <h3
                id={`group-${group.resource}`}
                className="text-foreground mb-2 text-sm font-semibold"
              >
                {resourceLabel(group.resource)}
              </h3>
              <ul className="divide-border divide-y">
                {group.permissions.map((permission) => (
                  <li key={permission.key} className="py-3">
                    <p className="text-sm font-medium">{permission.key}</p>
                    <p className="text-muted-foreground text-sm">
                      {permission.description}
                    </p>
                    <div
                      role="group"
                      aria-label={`Scopes for ${permission.key}`}
                      className="mt-2 flex flex-wrap gap-1.5"
                    >
                      {PERMISSION_SCOPES.map((scope) => {
                        const key = grantKey(permission.key, scope);
                        const isGranted = granted.has(key);
                        const isPending = pending.has(key);
                        return (
                          <Button
                            key={scope}
                            type="button"
                            size="xs"
                            variant={isGranted ? "default" : "outline"}
                            aria-pressed={isGranted}
                            aria-label={`${isGranted ? "Revoke" : "Grant"} ${permission.key} at ${SCOPE_LABELS[scope]} scope`}
                            disabled={readOnly || isPending}
                            aria-busy={isPending}
                            onClick={() => void toggle(permission, scope)}
                          >
                            {SCOPE_LABELS[scope]}
                          </Button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
