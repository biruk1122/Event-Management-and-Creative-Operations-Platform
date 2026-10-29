import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/features/files/lib/file-types";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/lib/documents-types";

import type { SharedDocumentListItem } from "../lib/shared-records-types";

interface SharedDocumentsTableProps {
  documents: readonly SharedDocumentListItem[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  filtered: boolean;
}

function uploadedAtLabel(document: SharedDocumentListItem): string {
  if (!document.fileAvailable || !document.uploadedAt) return "No file yet";
  return new Date(document.uploadedAt).toLocaleDateString();
}

export function SharedDocumentsTable({
  documents,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: SharedDocumentsTableProps) {
  if (documents.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered
            ? "No documents match these filters"
            : "No documents have been shared with you"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "When someone shares a document with you, it appears here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Upload date
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Size
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {documents.map((document) => (
              <tr key={document.id} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(document.id)}
                  >
                    {document.displayName}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">
                    {DOCUMENT_TYPE_LABELS[document.documentType]}
                  </Badge>
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {uploadedAtLabel(document)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {document.sizeBytes !== null
                    ? formatFileSize(document.sizeBytes)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 sm:hidden">
        {documents.map((document) => (
          <li key={document.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(document.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {document.displayName}
                <Badge variant="outline">
                  {DOCUMENT_TYPE_LABELS[document.documentType]}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {uploadedAtLabel(document)}
                {document.sizeBytes !== null
                  ? ` · ${formatFileSize(document.sizeBytes)}`
                  : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Shared documents pagination"
          className="flex items-center justify-between gap-3"
        >
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
