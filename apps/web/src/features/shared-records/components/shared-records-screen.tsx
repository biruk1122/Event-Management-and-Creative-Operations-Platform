"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { SharedRecordsManager } from "./shared-records-manager";

const LOGIN_HREF = "/login?next=%2Fshared-with-me";

/**
 * Every authenticated active employee reaches this screen - there is no
 * management-permission gate here, unlike Letters/Documents. The baseline
 * `share.read` grant every account already holds at SELF scope is the only
 * thing the API itself requires.
 */
export function SharedRecordsScreen() {
  const access = useCurrentAccess();

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

  return <SharedRecordsManager key={access.data.userId} />;
}
