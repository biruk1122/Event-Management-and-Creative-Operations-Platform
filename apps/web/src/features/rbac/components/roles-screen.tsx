"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  canManageRoles,
  useCurrentAccess,
} from "@/features/auth/api/access-queries";
import { Button } from "@/components/ui/button";
import type { RbacDrafts } from "../lib/rbac-outcome";
import { RolesManager } from "./roles-manager";

export function RolesScreen() {
  const access = useCurrentAccess();
  const client = useQueryClient();
  const [savedDrafts, setSavedDrafts] = useState<{
    userId: string;
    drafts: RbacDrafts;
  }>({ userId: "", drafts: { roles: {} } });
  if (access.data && access.data.userId !== savedDrafts.userId) {
    setSavedDrafts({ userId: access.data.userId, drafts: { roles: {} } });
  }
  const allowed = canManageRoles(access.data, "role.read");
  useEffect(() => {
    if (access.data === null || (access.isSuccess && !allowed)) {
      void client.cancelQueries({ queryKey: ["rbac"] });
      client.removeQueries({ queryKey: ["rbac"] });
    }
  }, [access.data, access.isSuccess, allowed, client]);
  if (access.isPending) return <p role="status">Checking permissions...</p>;
  return (
    <>
      {access.isError ? (
        <div role="alert">
          <p>{access.error.message}</p>
          <Button variant="outline" onClick={() => void access.refetch()}>
            Check permissions again
          </Button>
        </div>
      ) : null}
      {access.data && allowed ? (
        <RolesManager
          key={access.data.userId}
          access={access.data}
          accessUnavailable={access.isError}
          drafts={savedDrafts.drafts}
          onDraftsChange={(update) =>
            setSavedDrafts((current) => ({
              ...current,
              drafts: update(current.drafts),
            }))
          }
        />
      ) : access.data === null ? (
        <div role="alert">
          <p>Your session expired. Your unsaved input is kept in this tab.</p>
          <Link
            href="/login?next=%2Fsettings%2Froles"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign in in another tab
          </Link>
          <Button variant="outline" onClick={() => void access.refetch()}>
            I have signed in
          </Button>
        </div>
      ) : !access.isError ? (
        <p role="alert">You do not have access to this area.</p>
      ) : null}
    </>
  );
}
