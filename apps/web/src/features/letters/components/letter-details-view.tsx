"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  FileText,
  FolderOpen,
  Hash,
  Info,
  Mail,
  MessageSquareText,
  Paperclip,
  Plus,
  Reply,
  Send,
  Tag,
  UserRound,
} from "lucide-react";
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

const CARD = "border-border bg-card rounded-2xl border p-6 shadow-sm";

export function LetterDetailsView({
  letterId,
  access,
}: {
  letterId: string;
  access: CurrentAccess;
}) {
  // Letter details open as ?letter= on the listing, so Back closes the detail and keeps its filters.
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
    <div className="space-y-6">
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
          <Button variant="outline" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Back
            </Link>
          </Button>
          <header className="border-border bg-card relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8">
            <div
              aria-hidden="true"
              className="from-primary/10 pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-linear-to-l to-transparent"
            />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <span className="bg-primary text-primary-foreground inline-flex size-16 shrink-0 items-center justify-center rounded-2xl shadow-sm">
                <FileText aria-hidden="true" className="size-7" />
              </span>
              <div className="min-w-0 space-y-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Letter
                </p>
                <h1 className="text-3xl font-semibold tracking-tight break-words">
                  {letter.referenceNumber}
                </h1>
                <p className="text-primary/70 text-sm">
                  {LETTER_CATEGORY_LABELS[letter.category]}
                </p>
                <Badge
                  variant={
                    letter.direction === "INCOMING" ? "default" : "outline"
                  }
                >
                  {letter.direction === "INCOMING" ? "Incoming" : "Outgoing"}
                </Badge>
              </div>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section
              aria-label="Letter details"
              className={`${CARD} border-l-primary space-y-6 border-l-4`}
            >
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Info aria-hidden="true" className="text-primary size-4" />
                Letter Details
              </h2>
              <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
                {(
                  [
                    [Hash, "Reference", letter.referenceNumber],
                    [
                      CalendarDays,
                      "Date",
                      new Intl.DateTimeFormat(undefined, {
                        dateStyle: "long",
                      }).format(new Date(`${letter.date}T00:00:00`)),
                    ],
                    [Tag, "Category", LETTER_CATEGORY_LABELS[letter.category]],
                    [Send, letterPartyLabel(letter), letterParty(letter)],
                    [FolderOpen, "Project", letter.projectName],
                    ...(letter.direction === "INCOMING"
                      ? ([
                          [
                            Reply,
                            "Sender’s reference",
                            letter.senderReferenceNumber,
                          ],
                        ] as const)
                      : []),
                    [UserRound, "Registered by", letter.createdByName],
                    [FileText, "Subject", letter.subject],
                  ] as const
                ).map(([Icon, label, value]) => (
                  <div key={label} className="flex min-w-0 gap-3">
                    <span className="bg-accent text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-primary/70 text-xs">{label}</dt>
                      <dd className="mt-1 font-semibold break-words">
                        {value || "—"}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              <div className="border-border space-y-3 border-t pt-5">
                <div className="flex items-center gap-3">
                  <span className="bg-accent text-primary inline-flex size-10 items-center justify-center rounded-xl">
                    <FileText aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="font-semibold">Description</h3>
                </div>
                <p className="text-primary/70 text-sm break-words whitespace-pre-wrap">
                  {letter.shortDescription || "No description added."}
                </p>
              </div>
            </section>

            <aside
              aria-label="Letter type"
              className="border-border bg-accent/40 flex flex-col items-center justify-center gap-4 rounded-2xl border p-8 text-center shadow-sm"
            >
              <span className="bg-card text-primary inline-flex size-24 items-center justify-center rounded-3xl shadow-sm">
                <Mail aria-hidden="true" className="size-12" />
              </span>
              <p className="text-lg font-semibold">Official Letter</p>
              <p className="text-primary/70 text-sm">
                {LETTER_CATEGORY_LABELS[letter.category]} Document
              </p>
            </aside>
          </div>

          <section aria-label="Remarks" className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MessageSquareText
                  aria-hidden="true"
                  className="text-primary size-4"
                />
                Remarks
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRemarksOpen(true)}
              >
                <Plus aria-hidden="true" />
                Add Remark
              </Button>
            </div>
            <div className="bg-accent/40 mt-4 flex flex-col items-center gap-2 rounded-xl p-6 text-center">
              <span className="bg-card text-primary inline-flex size-12 items-center justify-center rounded-xl">
                <MessageSquareText aria-hidden="true" className="size-6" />
              </span>
              <p className="font-semibold">
                {letter.remark
                  ? "Registration remark"
                  : "No registration remark added."}
              </p>
              <p className="text-primary/70 text-sm break-words whitespace-pre-wrap">
                {letter.remark ?? "There are no remarks for this letter yet."}
              </p>
            </div>
          </section>

          <section aria-label="Attachments" className={CARD}>
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
              <Paperclip aria-hidden="true" className="text-primary size-4" />
              Attachments
            </h2>
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
              <p className="text-primary/70 text-sm">No attachments yet.</p>
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
