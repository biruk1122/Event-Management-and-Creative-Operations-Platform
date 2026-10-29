"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { ShareDialog } from "@/features/sharing";
import { DeleteLetterDialog } from "./delete-letter-dialog";
import { LetterAttachmentsDialog } from "./letter-attachments-dialog";
import { Button } from "@/components/ui/button";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  getLetter,
  getLetterOptions,
  LettersRequestError,
  listLetters,
  listRemarks,
} from "../api/letters-gateway";
import { letterKeys, useLettersMutations } from "../api/letters-queries";
import { CreateLetterDialog } from "./create-letter-dialog";
import { LetterDetailDialog } from "./letter-detail-dialog";
import { LetterFilters } from "./letter-filters";
import { LetterRemarksSheet } from "./letter-remarks-sheet";
import { LettersTable } from "./letters-table";
import type {
  Letter,
  LetterCategory,
  LetterDirection,
} from "../lib/letters-types";
import styles from "./letters-presentation.module.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function LettersManager({ access }: { access: CurrentAccess }) {
  const keys = letterKeys(access);
  const client = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelId = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const shareOpener = useRef<HTMLElement | null>(null);

  const direction: LetterDirection =
    searchParams.get("direction") === "OUTGOING" ? "OUTGOING" : "INCOMING";

  const canCreate = access.grants.some(
    (grant) =>
      grant.permissionKey === "letter.create" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
  const canEdit = access.grants.some(
    (grant) =>
      grant.permissionKey === "letter.update" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
  const canDelete = access.grants.some(
    (grant) =>
      grant.permissionKey === "letter.delete" && grant.scope === "ORGANIZATION",
  );
  const canShare = access.grants.some(
    (grant) =>
      grant.permissionKey === "letter.share" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LetterCategory | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Letter | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareLetter, setShareLetter] = useState<Letter | null>(null);
  const [attachmentsLetter, setAttachmentsLetter] = useState<Letter | null>(
    null,
  );
  const [remarksId, setRemarksId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    direction,
    category,
    projectId,
    search: debouncedSearch.trim(),
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listLetters(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const optionsQuery = useQuery({
    queryKey: keys.options,
    queryFn: ({ signal }) => getLetterOptions(signal),
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useLettersMutations(access);

  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof LettersRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const letters = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive =
    category !== null || projectId !== null || debouncedSearch.trim() !== "";

  function resetToFirstPage() {
    setPage(1);
  }

  function setDirection(next: LetterDirection) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("direction", next);
    router.replace(`?${params.toString()}`, { scroll: false });
    resetToFirstPage();
  }

  return (
    <div className={`${styles.surface} space-y-4`}>
      <header className={styles.pageHeader} data-admin-toolbar>
        <div className={styles.pageHeading}>
          <span className={styles.headerIcon}>
            <Mail aria-hidden="true" />
          </span>
          <div>
            <h1>Letters</h1>
            <p>
              Register, track, and discuss incoming and outgoing correspondence.
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Refresh"
            disabled={listQuery.isFetching}
            onClick={() => void listQuery.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={listQuery.isFetching ? styles.refreshing : undefined}
            />
          </Button>
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              New Letter
            </Button>
          ) : null}
        </div>
      </header>
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Letter direction"
        className={styles.directionTabs}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "INCOMING"
              : event.key === "End"
                ? "OUTGOING"
                : direction === "INCOMING"
                  ? "OUTGOING"
                  : "INCOMING";
          setDirection(next);
          tabsRef.current
            ?.querySelector<HTMLButtonElement>(
              `[data-letter-direction="${next}"]`,
            )
            ?.focus();
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          aria-label="Incoming"
          id={`${panelId}-incoming`}
          data-letter-direction="INCOMING"
          aria-controls={panelId}
          tabIndex={direction === "INCOMING" ? 0 : -1}
          aria-selected={direction === "INCOMING"}
          onClick={() => setDirection("INCOMING")}
        >
          <span className={styles.directionIcon}>
            <ArrowDownLeft aria-hidden="true" />
          </span>
          <span>
            <strong>Incoming</strong>
            <span>Received correspondence</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          aria-label="Outgoing"
          id={`${panelId}-outgoing`}
          data-letter-direction="OUTGOING"
          aria-controls={panelId}
          tabIndex={direction === "OUTGOING" ? 0 : -1}
          aria-selected={direction === "OUTGOING"}
          onClick={() => setDirection("OUTGOING")}
        >
          <span className={styles.directionIcon}>
            <ArrowUpRight aria-hidden="true" />
          </span>
          <span>
            <strong>Outgoing</strong>
            <span>Sent correspondence</span>
          </span>
        </Button>
      </div>
      <section
        className={styles.records}
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${panelId}-${direction === "INCOMING" ? "incoming" : "outgoing"}`}
      >
        {listQuery.isError ? (
          <div role="alert" className="space-y-2">
            <p>{(listQuery.error as Error).message}</p>
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {listQuery.isPending ? (
          <p role="status">Loading letters…</p>
        ) : listQuery.isError ? null : (
          <>
            <div className={styles.recordsHeading}>
              <div>
                <h2>
                  {direction === "INCOMING"
                    ? "Incoming letters"
                    : "Outgoing letters"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {total} letter{total === 1 ? "" : "s"}
                  {filtersActive ? " match these filters" : ""}
                </p>
              </div>
              {filtersActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCategory(null);
                    setProjectId(null);
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>

            <LetterFilters
              search={search}
              category={category}
              projectId={projectId}
              projects={optionsQuery.data?.projects ?? []}
              onSearchChange={(value) => {
                setSearch(value);
                resetToFirstPage();
              }}
              onCategoryChange={(value) => {
                setCategory(value);
                resetToFirstPage();
              }}
              onProjectChange={(value) => {
                setProjectId(value);
                resetToFirstPage();
              }}
            />

            <LettersTable
              letters={letters}
              onSelect={(id) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("letter", id);
                router.push(`?${params.toString()}`);
              }}
              onEdit={setSelectedId}
              onDelete={setDeleteTarget}
              canEdit={canEdit}
              canDelete={canDelete}
              onShare={(letter) => {
                shareOpener.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                setShareLetter(letter);
              }}
              canShare={canShare}
              onOpenAttachments={setAttachmentsLetter}
              onOpenRemarks={setRemarksId}
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              filtered={filtersActive}
            />
          </>
        )}
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {canCreate ? (
        <CreateLetterDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projects={optionsQuery.data?.projects ?? []}
          defaultDirection={direction}
          onCreate={mutations.create.mutateAsync}
          onCreated={() => {
            setSearch("");
            setCategory(null);
            setProjectId(null);
            setPage(1);
            setAnnouncement("Letter registered.");
          }}
        />
      ) : null}

      <LetterDetailDialog
        letterId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        projects={optionsQuery.data?.projects ?? []}
        canDelete={false}
        canShare={canShare}
        getLetter={getLetter}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onDelete={mutations.remove.mutateAsync}
        onDeleted={() => {
          setSelectedId(null);
          void listQuery.refetch();
          setAnnouncement("Letter deleted.");
        }}
        onChanged={() => void listQuery.refetch()}
      />

      <DeleteLetterDialog
        letter={canDelete ? deleteTarget : null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onDelete={mutations.remove.mutateAsync}
        onDeleted={() => {
          setDeleteTarget(null);
          setAnnouncement("Letter deleted.");
        }}
      />
      <LetterAttachmentsDialog
        letter={attachmentsLetter}
        onOpenChange={(open) => {
          if (!open) setAttachmentsLetter(null);
        }}
      />
      {canShare && shareLetter ? (
        <ShareDialog
          open
          onOpenChange={(open) => {
            if (!open) setShareLetter(null);
          }}
          parentKind="letter"
          parentId={shareLetter.id}
          parentLabel={shareLetter.referenceNumber}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = shareOpener.current;
            const fallback = document.querySelector<HTMLElement>(
              "[data-admin-toolbar] button:not(:disabled)",
            );
            (opener?.isConnected && opener.getClientRects().length
              ? opener
              : fallback
            )?.focus();
          }}
        />
      ) : null}
      <LetterRemarksSheet
        letterId={remarksId}
        referenceNumber={
          letters.find((l) => l.id === remarksId)?.referenceNumber
        }
        onOpenChange={(open) => {
          if (!open) setRemarksId(null);
        }}
        listRemarks={listRemarks}
        onAddRemark={(letterId, body) =>
          mutations.addRemark.mutateAsync({ letterId, body })
        }
      />
    </div>
  );
}
