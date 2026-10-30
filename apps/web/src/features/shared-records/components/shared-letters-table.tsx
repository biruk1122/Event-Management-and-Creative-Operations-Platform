import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  letterParty,
  letterPartyLabel,
  LETTER_CATEGORY_LABELS,
} from "@/features/letters/lib/letters-types";

import type { SharedLetterListItem } from "../lib/shared-records-types";

interface SharedLettersTableProps {
  letters: readonly SharedLetterListItem[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  filtered: boolean;
}

export function SharedLettersTable({
  letters,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: SharedLettersTableProps) {
  if (letters.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered
            ? "No letters match these filters"
            : "No letters have been shared with you"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "When someone shares a letter with you, it appears here."}
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
                Date
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Reference No.
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Subject
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {letters[0] ? letterPartyLabel(letters[0]) : "From/To"}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Category
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {letters.map((letter) => (
              <tr key={letter.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  {letter.date}
                </th>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(letter.id)}
                  >
                    {letter.referenceNumber}
                  </button>
                </td>
                <td className="text-muted-foreground max-w-xs truncate px-4 py-3">
                  {letter.subject}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {letterParty(letter) ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">
                    {LETTER_CATEGORY_LABELS[letter.category]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 sm:hidden">
        {letters.map((letter) => (
          <li key={letter.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(letter.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {letter.referenceNumber}
                <Badge variant="outline">
                  {LETTER_CATEGORY_LABELS[letter.category]}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {letter.date} · {letter.subject}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {letterPartyLabel(letter)}: {letterParty(letter) ?? "—"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Shared letters pagination"
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
