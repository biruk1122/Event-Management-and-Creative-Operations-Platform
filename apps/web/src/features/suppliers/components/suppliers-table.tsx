import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  supplierScopeLabel,
  supplierStatusLabel,
  supplierStatusVariant,
  type Supplier,
} from "../lib/suppliers-types";

interface SuppliersTableProps {
  suppliers: readonly Supplier[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

export function SuppliersTable({
  suppliers,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: SuppliersTableProps) {
  if (suppliers.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No suppliers match these filters" : "No suppliers yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New supplier button above to register the first one."}
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
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Category
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Directory
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {suppliers.map((supplier) => (
              <tr key={supplier.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(supplier.id)}
                  >
                    {supplier.name}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {supplier.category ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {supplierScopeLabel(supplier.departmentId)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={supplierStatusVariant(supplier.status)}>
                    {supplierStatusLabel(supplier.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {suppliers.map((supplier) => (
          <li key={supplier.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(supplier.id)}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {supplier.name}
                <Badge variant={supplierStatusVariant(supplier.status)}>
                  {supplierStatusLabel(supplier.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {supplier.category ?? "No category"} ·{" "}
                {supplierScopeLabel(supplier.departmentId)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Suppliers pagination"
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
