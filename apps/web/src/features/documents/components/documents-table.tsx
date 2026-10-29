import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/features/files/lib/file-types";
import {
  ArrowUpRight,
  CalendarDays,
  File,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FolderClosed,
  Mail,
  Receipt,
  UserRound,
  Share2,
} from "lucide-react";
import styles from "./documents-presentation.module.css";

import {
  DOCUMENT_TYPE_LABELS,
  type DocumentRecord,
} from "../lib/documents-types";

interface DocumentsTableProps {
  documents: readonly DocumentRecord[];
  onSelect: (id: string) => void;
  onShare: (document: DocumentRecord) => void;
  canShare: boolean;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
  layout?: "list" | "grid";
}

const DOCUMENT_ICONS = {
  LETTER: Mail,
  REPORT: FileText,
  PRICE_QUOTATION: FileSpreadsheet,
  CONTRACT: FilePenLine,
  INVOICE: Receipt,
  OTHER: File,
};

function DocumentIcon({ type }: { type: DocumentRecord["documentType"] }) {
  const Icon = DOCUMENT_ICONS[type];
  return <Icon aria-hidden="true" />;
}

function uploadedAtLabel(document: DocumentRecord): string {
  if (!document.fileAvailable || !document.uploadedAt) return "No file yet";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(document.uploadedAt));
}

export function DocumentsTable({
  documents,
  onSelect,
  onShare,
  canShare,
  page,
  pageCount,
  onPageChange,
  filtered,
  layout = "list",
}: DocumentsTableProps) {
  if (documents.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>
          <FolderClosed aria-hidden="true" />
        </span>
        <p className="text-sm font-medium">
          {filtered ? "No documents match these filters" : "No documents yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Your registered documents and uploaded files will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      {layout === "list" ? (
        <div
          className={`${styles.tableViewport} hidden sm:block`}
          role="region"
          aria-label="Documents register"
          tabIndex={0}
        >
          <table className={styles.table}>
            <caption className="sr-only">
              Document library. Open a document to manage its details and file.
            </caption>
            <thead className="text-muted-foreground border-border border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Document of
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Uploaded
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Uploaded by
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Size
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Share
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {documents.map((document) => (
                <tr key={document.id} className="hover:bg-muted/50">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <button
                      type="button"
                      className={styles.documentLink}
                      onClick={() => onSelect(document.id)}
                    >
                      <span className={styles.fileIcon}>
                        <DocumentIcon type={document.documentType} />
                      </span>
                      <span className={styles.documentIdentity}>
                        <span className={styles.documentName}>
                          {document.displayName}
                        </span>
                        <span className={styles.filename}>
                          {document.fileAvailable
                            ? document.originalFilename || "File attached"
                            : "Awaiting file upload"}
                        </span>
                      </span>
                    </button>
                  </th>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={styles.typeBadge}>
                      {DOCUMENT_TYPE_LABELS[document.documentType]}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {document.sourceLetterReferenceNumber
                      ? `Letter ${document.sourceLetterReferenceNumber}`
                      : (document.projectName ?? "No linked project")}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {uploadedAtLabel(document)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {document.fileAvailable
                      ? (document.uploadedByName ?? "—")
                      : "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {document.fileAvailable && document.sizeBytes !== null
                      ? formatFileSize(document.sizeBytes)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canShare ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Share ${document.displayName}`}
                        onClick={() => onShare(document)}
                      >
                        <Share2 aria-hidden="true" />
                        Share
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">Unavailable</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Open ${document.displayName} details`}
                      onClick={() => onSelect(document.id)}
                    >
                      <ArrowUpRight aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Mobile: a stacked card list. */}
      <ul
        aria-label="Document cards"
        className={layout === "grid" ? styles.cardGrid : styles.mobileCards}
      >
        {documents.map((document) => (
          <li key={document.id} className={styles.documentCard}>
            <button
              type="button"
              className={styles.cardButton}
              onClick={() => onSelect(document.id)}
            >
              <span className={styles.cardTop}>
                <span className={styles.cardIcon}>
                  <DocumentIcon type={document.documentType} />
                </span>
                <ArrowUpRight aria-hidden="true" />
              </span>
              <span className={styles.cardName}>{document.displayName}</span>
              <span className={styles.filename}>
                {document.fileAvailable
                  ? document.originalFilename || "File attached"
                  : "Awaiting file upload"}
              </span>
              <span className={styles.cardTags}>
                <Badge variant="outline" className={styles.typeBadge}>
                  {DOCUMENT_TYPE_LABELS[document.documentType]}
                </Badge>
                {document.fileAvailable && document.sizeBytes !== null ? (
                  <span>{formatFileSize(document.sizeBytes)}</span>
                ) : null}
              </span>
              <span className={styles.cardMeta}>
                <FolderClosed aria-hidden="true" />
                {document.sourceLetterReferenceNumber
                  ? `Letter ${document.sourceLetterReferenceNumber}`
                  : document.projectName || "No linked project"}
              </span>
              <span className={styles.cardMeta}>
                <CalendarDays aria-hidden="true" />
                {uploadedAtLabel(document)}
              </span>
              {document.fileAvailable && document.uploadedByName ? (
                <span className={styles.cardMeta}>
                  <UserRound aria-hidden="true" />
                  {document.uploadedByName}
                </span>
              ) : null}
            </button>
            {canShare ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mx-5 mb-5"
                onClick={() => onShare(document)}
              >
                <Share2 aria-hidden="true" />
                Share
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav aria-label="Documents pagination" className={styles.pagination}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
