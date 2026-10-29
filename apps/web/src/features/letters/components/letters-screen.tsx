"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LetterDetailsView } from "./letter-details-view";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { canAccessAdministrationDocuments } from "../lib/letter-access";
import { LettersManager } from "./letters-manager";

const LOGIN_HREF = "/login?next=%2Fletters";

export function LettersScreen() {
  const searchParams = useSearchParams();
  const letterId = searchParams.get("letter");
  const access = useCurrentAccess();
  const client = useQueryClient();
  const allowed = access.data
    ? canAccessAdministrationDocuments(access.data)
    : false;

  useEffect(() => {
    if (access.data === null || (access.isSuccess && !allowed)) {
      void client.cancelQueries({ queryKey: ["letters"] });
      client.removeQueries({ queryKey: ["letters"] });
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

  if (letterId)
    return (
      <LetterDetailsView
        key={`${access.data.userId}:${letterId}`}
        letterId={letterId}
        access={access.data}
      />
    );

  return <LettersManager key={access.data.userId} access={access.data} />;
}
