"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getSupplier as defaultGetSupplier } from "../api/suppliers-gateway";
import { SupplierFields } from "./supplier-fields";
import type {
  GetSupplier,
  SupplierFieldValues,
  UpdateSupplier,
} from "../lib/suppliers-outcome";
import {
  supplierScopeLabel,
  supplierStatusLabel,
  supplierStatusVariant,
  SUPPLIER_STATUSES,
  type Supplier,
} from "../lib/suppliers-types";

const ACTION_ERRORS: Record<string, string> = {
  duplicate: "A supplier with this name already exists for this directory.",
  not_found: "This supplier no longer exists. Close this and refresh the list.",
  permission_denied: "You do not have permission to do that.",
  unexpected: "We could not save that change. Try again.",
};

function actionError(key: string): string {
  return ACTION_ERRORS[key] ?? ACTION_ERRORS.unexpected!;
}

function fieldsFromSupplier(supplier: Supplier): SupplierFieldValues {
  return {
    name: supplier.name,
    category: supplier.category ?? "",
    contactName: supplier.contactName ?? "",
    contactEmail: supplier.contactEmail ?? "",
    contactPhone: supplier.contactPhone ?? "",
    notes: supplier.notes ?? "",
  };
}

interface SupplierDetailDialogProps {
  supplierId: string | null;
  onOpenChange: (open: boolean) => void;
  canUpdate: boolean;
  getSupplier?: GetSupplier;
  onUpdate: UpdateSupplier;
  onChanged: (supplier: Supplier) => void;
}

export function SupplierDetailDialog({
  supplierId,
  onOpenChange,
  ...bodyProps
}: SupplierDetailDialogProps) {
  return (
    <Dialog
      open={supplierId !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {supplierId !== null ? (
          <SupplierDetailBody
            key={supplierId}
            supplierId={supplierId}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = Omit<
  SupplierDetailDialogProps,
  "supplierId" | "onOpenChange"
> & { supplierId: string };

function SupplierDetailBody({
  supplierId,
  canUpdate,
  getSupplier = defaultGetSupplier,
  onUpdate,
  onChanged,
}: BodyProps) {
  const statusId = useId();

  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [fields, setFields] = useState<SupplierFieldValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof SupplierFieldValues, string>>
  >({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getSupplier(supplierId).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setStatus("error");
        return;
      }
      setSupplier(loaded);
      setFields(fieldsFromSupplier(loaded));
      setStatus("loaded");
    });
    return () => {
      cancelled = true;
    };
  }, [supplierId, getSupplier]);

  function apply(next: Supplier) {
    setSupplier(next);
    setFields(fieldsFromSupplier(next));
    onChanged(next);
  }

  function setField<K extends keyof SupplierFieldValues>(
    key: K,
    value: SupplierFieldValues[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDetails() {
    if (!supplier || !fields) return;
    if (fields.name.trim() === "") {
      setFieldErrors({ name: "Enter a name." });
      return;
    }

    setDetailsBusy(true);
    setDetailsError(null);
    setFieldErrors({});
    const outcome = await onUpdate(supplier.id, fields);
    setDetailsBusy(false);

    if (outcome.status === "success") {
      apply(outcome.supplier);
      setAnnouncement("Supplier details saved.");
      return;
    }
    if (outcome.status === "field_errors") {
      setFieldErrors(outcome.fieldErrors);
      return;
    }
    setDetailsError(actionError(outcome.status));
  }

  async function changeStatus(next: string) {
    if (!supplier) return;
    setStatusBusy(true);
    setStatusError(null);
    const outcome = await onUpdate(supplier.id, {
      status: next as Supplier["status"],
    });
    setStatusBusy(false);
    if (outcome.status === "success") {
      apply(outcome.supplier);
      setAnnouncement(
        `Status changed to ${supplierStatusLabel(outcome.supplier.status)}.`,
      );
      return;
    }
    setStatusError(actionError(outcome.status));
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-10 text-sm"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Loading supplier…
      </div>
    );
  }

  if (status === "error" || !supplier || !fields) {
    return (
      <Alert variant="destructive">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We could not load this supplier</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{supplier.name}</DialogTitle>
          <Badge variant={supplierStatusVariant(supplier.status)}>
            {supplierStatusLabel(supplier.status)}
          </Badge>
        </div>
        <DialogDescription>
          {supplierScopeLabel(supplier.departmentId)}
        </DialogDescription>
      </DialogHeader>

      <form
        aria-label="Edit supplier details"
        className="space-y-4"
        noValidate
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void saveDetails();
        }}
      >
        <SupplierFields
          values={fields}
          errors={fieldErrors}
          disabled={detailsBusy || !canUpdate}
          onChange={setField}
        />
        {detailsError ? (
          <p className="text-destructive text-sm" role="alert">
            {detailsError}
          </p>
        ) : null}
        {canUpdate ? (
          <Button
            type="submit"
            size="sm"
            disabled={detailsBusy}
            aria-busy={detailsBusy}
          >
            {detailsBusy ? "Saving…" : "Save details"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            You have read-only access to this supplier&rsquo;s details.
          </p>
        )}
      </form>

      {canUpdate ? (
        <section className="border-border space-y-2 border-t pt-4">
          <Label htmlFor={statusId}>Status</Label>
          <Select
            value={supplier.status}
            disabled={statusBusy}
            onValueChange={(value) => void changeStatus(value)}
          >
            <SelectTrigger id={statusId} aria-busy={statusBusy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPLIER_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {supplierStatusLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusError ? (
            <p className="text-destructive text-sm" role="alert">
              {statusError}
            </p>
          ) : null}
        </section>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
