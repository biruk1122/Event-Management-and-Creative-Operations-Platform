"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  listSharedDocuments,
  listSharedLetters,
} from "../api/shared-records-gateway";
import { SharedDocumentDetailDialog } from "./shared-document-detail-dialog";
import { SharedDocumentsTable } from "./shared-documents-table";
import { SharedLetterDetailDialog } from "./shared-letter-detail-dialog";
import { SharedLettersTable } from "./shared-letters-table";

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

export function SharedRecordsManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "documents" ? "documents" : "letters";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    search: debouncedSearch.trim(),
    page,
    pageSize: PAGE_SIZE,
  };

  const lettersQuery = useQuery({
    queryKey: ["shared-with-me", "letters", listParams],
    queryFn: ({ signal }) => listSharedLetters(listParams, signal),
    enabled: tab === "letters",
    retry: false,
    placeholderData: (previous) => previous,
  });
  const documentsQuery = useQuery({
    queryKey: ["shared-with-me", "documents", listParams],
    queryFn: ({ signal }) => listSharedDocuments(listParams, signal),
    enabled: tab === "documents",
    retry: false,
    placeholderData: (previous) => previous,
  });

  function setTab(next: "letters" | "documents") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`?${params.toString()}`, { scroll: false });
    setSearch("");
    setPage(1);
  }

  const activeQuery = tab === "letters" ? lettersQuery : documentsQuery;
  const total = activeQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive = debouncedSearch.trim() !== "";

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Shared record type"
        className="flex gap-2"
      >
        <Button
          type="button"
          variant={tab === "letters" ? "default" : "outline"}
          size="sm"
          role="tab"
          aria-selected={tab === "letters"}
          onClick={() => setTab("letters")}
        >
          Letters
        </Button>
        <Button
          type="button"
          variant={tab === "documents" ? "default" : "outline"}
          size="sm"
          role="tab"
          aria-selected={tab === "documents"}
          onClick={() => setTab("documents")}
        >
          Documents
        </Button>
      </div>

      {activeQuery.isError ? (
        <div role="alert" className="space-y-2">
          <p>{(activeQuery.error as Error).message}</p>
          <Button variant="outline" onClick={() => void activeQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {activeQuery.isPending ? (
        <p role="status">
          Loading shared {tab === "letters" ? "letters" : "documents"}…
        </p>
      ) : activeQuery.isError ? null : (
        <>
          <div
            data-admin-toolbar
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-muted-foreground text-sm">
              {total} {tab === "letters" ? "letter" : "document"}
              {total === 1 ? "" : "s"}
              {filtersActive ? " match this search" : ""}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh"
              onClick={() => void activeQuery.refetch()}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          </div>

          <div className="max-w-sm space-y-2">
            <Label htmlFor="shared-records-search">Search</Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="shared-records-search"
                type="search"
                placeholder={
                  tab === "letters"
                    ? "Reference, subject, sender/recipient"
                    : "Name, filename"
                }
                className="pl-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {tab === "letters" ? (
            <SharedLettersTable
              letters={lettersQuery.data?.items ?? []}
              onSelect={setSelectedLetterId}
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              filtered={filtersActive}
            />
          ) : (
            <SharedDocumentsTable
              documents={documentsQuery.data?.items ?? []}
              onSelect={setSelectedDocumentId}
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              filtered={filtersActive}
            />
          )}
        </>
      )}

      <SharedLetterDetailDialog
        letterId={selectedLetterId}
        onOpenChange={(open) => {
          if (!open) setSelectedLetterId(null);
        }}
      />
      <SharedDocumentDetailDialog
        documentId={selectedDocumentId}
        onOpenChange={(open) => {
          if (!open) setSelectedDocumentId(null);
        }}
      />
    </div>
  );
}
