"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import { canAccessAdministrationDocuments } from "@/features/letters/lib/letter-access";

import { DocumentsManager } from "./documents-manager";

const LOGIN_HREF = "/login?next=%2Fdocuments";

export function DocumentsScreen() {
  const access = useCurrentAccess();
  const client = useQueryClient();
  const allowed = access.data
    ? canAccessAdministrationDocuments(access.data)
    : false;

  useEffect(() => {
    if (access.data === null || (access.isSuccess && !allowed)) {
      void client.cancelQueries({ queryKey: ["documents"] });
      client.removeQueries({ queryKey: ["documents"] });
    }
  }, [access.data, access.isSuccess, allowed, client]);

  if (access.isPending) {
    return <p role="status">Checking permissions…</p>;
  }

  if (access.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
      </div>
    );
  }

  if (access.data === null) {
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Your unsaved input is kept in this tab.</p>
        <Link
          href={LOGIN_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline underline-offset-4"
        >
          Sign in in another tab
        </Link>
        <Button variant="outline" onClick={() => void access.refetch()}>
          I have signed in
        </Button>
      </div>
    );
  }

  if (!allowed) {
    return <p role="alert">You do not have access to this area.</p>;
  }

  return <DocumentsManager key={access.data.userId} access={access.data} />;
}
