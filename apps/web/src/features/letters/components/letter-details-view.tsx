"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  getLetter,
  LettersRequestError,
  listLetterFiles,
  listRemarks,
} from "../api/letters-gateway";
import { letterKeys, useLettersMutations } from "../api/letters-queries";
import {
  LETTER_CATEGORY_LABELS,
  letterParty,
  letterPartyLabel,
} from "../lib/letters-types";
import { LetterAttachmentList } from "./letter-attachment-list";
import { LetterRemarksSheet } from "./letter-remarks-sheet";
import styles from "./letters-presentation.module.css";

export function LetterDetailsView({
  letterId,
  access,
}: {
  letterId: string;
  access: CurrentAccess;
}) {
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete("letter");
  const backHref = {
    pathname: "/letters",
    search: params.size ? `?${params}` : "",
  };
  const keys = letterKeys(access);
  const client = useQueryClient();
  const [remarksOpen, setRemarksOpen] = useState(false);
  const mutations = useLettersMutations(access);
  const detail = useQuery({
    queryKey: keys.detail(letterId),
    queryFn: () => getLetter(letterId),
    retry: false,
  });
  const files = useQuery({
    queryKey: [...keys.detail(letterId), "files"],
    queryFn: ({ signal }) => listLetterFiles(letterId, signal),
    retry: false,
    enabled: !!detail.data,
  });
  const accessError = [detail.error, files.error].some(
    (error) =>
      error instanceof LettersRequestError &&
      (error.status === 401 || error.status === 403),
  );
  useEffect(() => {
    if (accessError) void client.invalidateQueries({ queryKey: accessKey });
  }, [accessError, client]);
  const letter = detail.data;
  return (
    <div className={`${styles.surface} space-y-5`}>
      <div data-admin-toolbar>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to letters
        </Link>
      </div>
      {detail.isPending ? (
        <p role="status">Loading letter details…</p>
      ) : detail.isError || accessError ? (
        <div role="alert" className="space-y-3">
          <p>{detail.error?.message ?? files.error?.message}</p>
          <Button
            variant="outline"
            onClick={() => {
              void detail.refetch();
              if (files.isError) void files.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : !letter ? (
        <p role="alert">This letter no longer exists.</p>
      ) : (
        <>
          <header className={styles.pageHeader}>
            <div className={styles.pageHeading}>
              <span className={styles.headerIcon}>
                <FileText aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p>{letter.referenceNumber}</p>
                <h1 className="break-words">{letter.subject}</h1>
              </div>
            </div>
            <Badge variant="outline">
              {letter.direction === "INCOMING" ? "Incoming" : "Outgoing"}
            </Badge>
          </header>
          <section aria-label="Letter details" className={styles.records}>
            <h2 className="mb-5 text-lg font-semibold">Letter details</h2>
            <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Reference", letter.referenceNumber],
                [
                  "Date",
                  new Intl.DateTimeFormat(undefined, {
                    dateStyle: "long",
                  }).format(new Date(`${letter.date}T00:00:00`)),
                ],
                ["Category", LETTER_CATEGORY_LABELS[letter.category]],
                [letterPartyLabel(letter), letterParty(letter)],
                ["Project", letter.projectName],
                ...(letter.direction === "INCOMING"
                  ? [["Sender’s reference", letter.senderReferenceNumber]]
                  : []),
                ["Registered by", letter.createdByName],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-medium break-words">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 space-y-2 border-t pt-5">
              <h3 className="font-medium">Description</h3>
              <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
                {letter.shortDescription || "No description added."}
              </p>
            </div>
          </section>
          <section aria-label="Remarks" className={styles.records}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Remarks</h2>
              <Button variant="outline" onClick={() => setRemarksOpen(true)}>
                <MessageSquareText aria-hidden="true" />
                View remarks
              </Button>
            </div>
            <p className="text-muted-foreground mt-3 text-sm break-words whitespace-pre-wrap">
              {letter.remark || "No registration remark added."}
            </p>
          </section>
          <section aria-label="Attachments" className={styles.records}>
            <h2 className="mb-4 text-lg font-semibold">Attachments</h2>
            {files.isPending ? (
              <p role="status">Loading attachments…</p>
            ) : files.isError ? (
              <div role="alert">
                <p>{files.error.message}</p>
                <Button variant="outline" onClick={() => void files.refetch()}>
                  Retry attachments
                </Button>
              </div>
            ) : files.data.length ? (
              <LetterAttachmentList letterId={letterId} files={files.data} />
            ) : (
              <p className="text-muted-foreground text-sm">
                No attachments yet.
              </p>
            )}
          </section>
          <LetterRemarksSheet
            letterId={remarksOpen ? letterId : null}
            referenceNumber={letter.referenceNumber}
            onOpenChange={setRemarksOpen}
            listRemarks={listRemarks}
            onAddRemark={(id, body) =>
              mutations.addRemark.mutateAsync({ letterId: id, body })
            }
          />
        </>
      )}
    </div>
  );
}
