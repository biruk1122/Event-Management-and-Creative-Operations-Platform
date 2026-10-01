"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { reportKeys } from "../api/reports-queries";
import { reportAbilities } from "../lib/reports-access";
import { ReportsManager } from "./reports-manager";

export function ReportsScreen() {
  const access = useCurrentAccess();
  const client = useQueryClient();
  const allowed = access.data ? reportAbilities(access.data).canRead : false;

  useEffect(() => {
    if (access.data === null || (access.isSuccess && !allowed)) {
      void client.cancelQueries({ queryKey: ["reports"] });
      client.removeQueries({ queryKey: ["reports"] });
    }
  }, [access.data, access.isSuccess, allowed, client]);

  if (access.isPending)
    return <p role="status">Checking report permissions…</p>;
  if (access.isError)
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
      </div>
    );
  if (access.data === null)
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Sign in to view reports.</p>
        <Link
          href="/login?next=%2Freports"
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
        <Button variant="outline" onClick={() => void access.refetch()}>
          I have signed in
        </Button>
      </div>
    );
  if (!allowed) return <p role="alert">You do not have access to reports.</p>;

  const key = reportKeys(access.data).all.join(":");
  return <ReportsManager key={key} access={access.data} />;
}
