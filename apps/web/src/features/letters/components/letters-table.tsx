import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Inbox,
  MessageSquareText,
  Paperclip,
  Share2,
  Pencil,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  letterParty,
  letterPartyLabel,
  LETTER_CATEGORY_LABELS,
  type Letter,
} from "../lib/letters-types";
import styles from "./letters-presentation.module.css";

function formatLetterDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

interface LettersTableProps {
  letters: readonly Letter[];
  onSelect: (id: string) => void;
  onOpenRemarks: (id: string) => void;
  onOpenAttachments: (letter: Letter) => void;
  onShare: (letter: Letter) => void;
  canShare: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (id: string) => void;
  onDelete: (letter: Letter) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

export function LettersTable({
  letters,
  onSelect,
  onOpenRemarks,
  onOpenAttachments,
  onShare,
  canShare,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  page,
  pageCount,
  onPageChange,
  filtered,
}: LettersTableProps) {
  if (letters.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>
          <Inbox aria-hidden="true" />
        </span>
        <p className="text-sm font-medium">
          {filtered ? "No letters match these filters" : "No letters yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Registered correspondence will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div
        className={`${styles.tableViewport} hidden sm:block`}
        role="region"
        aria-label="Letters register"
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className="sr-only">
            Registered letters. Open a reference number to view and manage a
            letter.
          </caption>
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Reference
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Subject
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {letters[0] ? letterPartyLabel(letters[0]) : "From/To"}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Project / Category
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Date
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Attachments
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Share
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Remarks
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {letters.map((letter) => (
              <tr key={letter.id} className="hover:bg-muted/50">
                <th scope="row" className={styles.letterCell}>
                  <button
                    type="button"
                    className={styles.letterLink}
                    onClick={() => onSelect(letter.id)}
                  >
                    <span className={styles.fileIcon}>
                      <FileText aria-hidden="true" />
                    </span>
                    <span className={styles.letterIdentity}>
                      <span className={styles.reference}>
                        {letter.referenceNumber}
                      </span>
                    </span>
                  </button>
                </th>
                <td className={styles.letterSubject}>
                  <button
                    type="button"
                    className={styles.letterLink}
                    onClick={() => onSelect(letter.id)}
                  >
                    {letter.subject}
                  </button>
                </td>
                <td className={styles.partyCell}>
                  {letterParty(letter) ?? "—"}
                </td>
                <td className={styles.projectCell}>
                  <span>{letter.projectName ?? "No linked project"}</span>
                  <Badge variant="outline">
                    {LETTER_CATEGORY_LABELS[letter.category]}
                  </Badge>
                </td>
                <td className={styles.dateCell}>
                  {formatLetterDate(letter.date)}
                </td>
                <td className="px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Attachments for ${letter.referenceNumber}`}
                    onClick={() => onOpenAttachments(letter)}
                  >
                    <Paperclip aria-hidden="true" />
                    {letter.attachmentCount}
                  </Button>
                </td>
                <td className="px-4 py-3">
                  {canShare ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Share ${letter.referenceNumber}`}
                      onClick={() => onShare(letter)}
                    >
                      <Share2 aria-hidden="true" />
                      Share
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">Unavailable</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remarks for ${letter.referenceNumber}`}
                    onClick={() => onOpenRemarks(letter.id)}
                  >
                    <MessageSquareText aria-hidden="true" />
                    Remarks
                  </Button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${letter.referenceNumber}`}
                        onClick={() => onEdit(letter.id)}
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        aria-label={`Delete ${letter.referenceNumber}`}
                        onClick={() => onDelete(letter)}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </Button>
                    ) : null}
                    {!canEdit && !canDelete ? (
                      <span className="text-muted-foreground">Unavailable</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {letters.map((letter) => (
          <li key={letter.id} className={styles.mobileCard}>
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(letter.id)}
            >
              <span className={styles.mobileCardTop}>
                <span className={styles.reference}>
                  {letter.referenceNumber}
                </span>
                <ArrowUpRight aria-hidden="true" />
              </span>
              <span className={styles.mobileSubject}>{letter.subject}</span>
              <span className={styles.mobileMeta}>
                <CalendarDays aria-hidden="true" />
                {formatLetterDate(letter.date)}
              </span>
              <span className={styles.mobileMeta}>
                {letterPartyLabel(letter)}: {letterParty(letter) ?? "—"}
              </span>
              <span className={styles.mobileTags}>
                <Badge variant="outline">
                  {LETTER_CATEGORY_LABELS[letter.category]}
                </Badge>
                <Badge
                  variant={letter.attachmentCount > 0 ? "default" : "outline"}
                >
                  {letter.attachmentCount} file
                  {letter.attachmentCount === 1 ? "" : "s"}
                </Badge>
                {letter.projectName ? <span>{letter.projectName}</span> : null}
              </span>
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenAttachments(letter)}
              >
                <Paperclip aria-hidden="true" />
                Attachments
              </Button>
              {canShare ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onShare(letter)}
                >
                  <Share2 aria-hidden="true" />
                  Share
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenRemarks(letter.id)}
              >
                <MessageSquareText
                  aria-hidden="true"
                  data-icon="inline-start"
                />
                Remarks
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(letter.id)}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onDelete(letter)}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav aria-label="Letters pagination" className={styles.pagination}>
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
