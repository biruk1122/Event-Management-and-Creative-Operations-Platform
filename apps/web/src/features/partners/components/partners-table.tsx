import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  partnerStatusLabel,
  partnerStatusVariant,
  personName,
  type Partner,
} from "../lib/partners-types";

interface PartnersTableProps {
  partners: readonly Partner[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

export function PartnersTable({
  partners,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: PartnersTableProps) {
  if (partners.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No partners match these filters" : "No partners yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New partner button above to register the first opportunity."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Organization
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Category
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Owner
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {partners.map((partner) => (
              <tr key={partner.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(partner.id)}
                  >
                    {partner.organizationName}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {partner.category}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {personName(partner.owner)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={partnerStatusVariant(partner.status)}>
                    {partnerStatusLabel(partner.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {partners.map((partner) => (
          <li key={partner.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(partner.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {partner.organizationName}
                <Badge variant={partnerStatusVariant(partner.status)}>
                  {partnerStatusLabel(partner.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {partner.category} · {personName(partner.owner)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Partners pagination"
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
