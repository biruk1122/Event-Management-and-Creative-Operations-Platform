"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Files, LayoutGrid, List, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShareDialog } from "@/features/sharing";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  DocumentsRequestError,
  getDocument,
  getDocumentOptions,
  listDocuments,
} from "../api/documents-gateway";
import { documentKeys, useDocumentsMutations } from "../api/documents-queries";
import { CreateDocumentDialog } from "./create-document-dialog";
import { DocumentDetailDialog } from "./document-detail-dialog";
import { DocumentFilters } from "./document-filters";
import { DocumentsTable } from "./documents-table";
import type { DocumentRecord, DocumentType } from "../lib/documents-types";
import styles from "./documents-presentation.module.css";

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

export function DocumentsManager({ access }: { access: CurrentAccess }) {
  const keys = documentKeys(access);
  const client = useQueryClient();
  const shareOpener = useRef<HTMLElement | null>(null);

  const canCreate = access.grants.some(
    (grant) =>
      grant.permissionKey === "document.create" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
  const canDelete = access.grants.some(
    (grant) =>
      grant.permissionKey === "document.delete" &&
      grant.scope === "ORGANIZATION",
  );
  const canShare = access.grants.some(
    (grant) =>
      grant.permissionKey === "document.share" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareDocument, setShareDocument] = useState<DocumentRecord | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [layout, setLayout] = useState<"list" | "grid">("list");

  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const listParams = {
    documentType,
    projectId,
    search: debouncedSearch.trim(),
    page,
    pageSize: PAGE_SIZE,
  };

  const listQuery = useQuery({
    queryKey: keys.list(listParams),
    queryFn: ({ signal }) => listDocuments(listParams, signal),
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });

  const optionsQuery = useQuery({
    queryKey: keys.options,
    queryFn: ({ signal }) => getDocumentOptions(signal),
    retry: false,
    staleTime: 60_000,
  });

  const mutations = useDocumentsMutations(access);

  useEffect(() => {
    const error = listQuery.error;
    if (
      error instanceof DocumentsRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [listQuery.error, client]);

  const data = listQuery.data;
  const documents = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const filtersActive =
    documentType !== null ||
    projectId !== null ||
    debouncedSearch.trim() !== "";

  function resetToFirstPage() {
    setPage(1);
  }

  return (
    <div className={`${styles.surface} space-y-4`}>
      <header className={styles.pageHeader} data-admin-toolbar>
        <div className={styles.pageHeading}>
          <span className={styles.headerIcon}>
            <Files aria-hidden="true" />
          </span>
          <div>
            <h1>Documents</h1>
            <p>
              Store, organize, and share quotations, contracts, invoices, and
              more.
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
              New Document
            </Button>
          ) : null}
        </div>
      </header>
      <section className={styles.library} aria-label="Document library">
        {listQuery.isError ? (
          <div role="alert" className="space-y-2">
            <p>{(listQuery.error as Error).message}</p>
            <Button variant="outline" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {listQuery.isPending ? (
          <p role="status">Loading documents…</p>
        ) : listQuery.isError ? null : (
          <>
            <div className={styles.libraryHeading}>
              <div>
                <h2>Your documents</h2>
                <p className="text-muted-foreground text-sm">
                  {total} document{total === 1 ? "" : "s"}
                  {filtersActive ? " match these filters" : ""}
                </p>
              </div>
              <div className={styles.libraryActions}>
                {filtersActive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setDocumentType(null);
                      setProjectId(null);
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
                <div
                  className={styles.layoutSwitch}
                  role="group"
                  aria-label="Document layout"
                >
                  <Button
                    size="icon"
                    variant={layout === "list" ? "default" : "ghost"}
                    aria-label="List layout"
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                  >
                    <List aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant={layout === "grid" ? "default" : "ghost"}
                    aria-label="Grid layout"
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    <LayoutGrid aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>

            <DocumentFilters
              search={search}
              documentType={documentType}
              projectId={projectId}
              projects={optionsQuery.data?.projects ?? []}
              onSearchChange={(value) => {
                setSearch(value);
                resetToFirstPage();
              }}
              onDocumentTypeChange={(value) => {
                setDocumentType(value);
                resetToFirstPage();
              }}
              onProjectChange={(value) => {
                setProjectId(value);
                resetToFirstPage();
              }}
            />

            <DocumentsTable
              documents={documents}
              onSelect={setSelectedId}
              onShare={(record) => {
                shareOpener.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                setShareDocument(record);
              }}
              canShare={canShare}
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
              filtered={filtersActive}
              layout={layout}
            />
          </>
        )}
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {canCreate ? (
        <CreateDocumentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projects={optionsQuery.data?.projects ?? []}
          onCreate={mutations.create.mutateAsync}
          onCreated={(created) => {
            setSearch("");
            setDocumentType(null);
            setProjectId(null);
            setPage(1);
            setAnnouncement("Document created.");
            setSelectedId(created.id);
          }}
        />
      ) : null}

      <DocumentDetailDialog
        documentId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        projects={optionsQuery.data?.projects ?? []}
        canDelete={canDelete}
        canShare={canShare}
        getDocument={getDocument}
        onUpdate={(id, values) => mutations.update.mutateAsync({ id, values })}
        onDelete={mutations.remove.mutateAsync}
        onDeleted={() => {
          setSelectedId(null);
          void listQuery.refetch();
          setAnnouncement("Document deleted.");
        }}
        onChanged={() => void listQuery.refetch()}
      />
      {canShare && shareDocument ? (
        <ShareDialog
          open
          onOpenChange={(open) => {
            if (!open) setShareDocument(null);
          }}
          parentKind="document"
          parentId={shareDocument.id}
          parentLabel={shareDocument.displayName}
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
    </div>
  );
}
