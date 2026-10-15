"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createProductionLocation,
  deleteProductionLocation,
  listProductionLocations,
  updateProductionLocation,
  type ProductionLocationValues,
} from "../api/productions-gateway";
import {
  productionLocationStatusLabel,
  PRODUCTION_LOCATION_STATUSES,
  type ProductionLocation,
} from "../lib/production-types";

const EMPTY: ProductionLocationValues = {
  name: "",
  address: "",
  description: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  status: "PENDING",
  notes: "",
};

const STATUS_VARIANT: Record<
  ProductionLocation["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  PENDING: "destructive",
  IN_PROGRESS: "outline",
  CONFIRMED: "secondary",
  READY: "default",
};

function LocationForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial?: ProductionLocationValues;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: ProductionLocationValues) => void;
}) {
  const id = useId();
  const [values, setValues] = useState<ProductionLocationValues>(
    initial ?? EMPTY,
  );
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("Enter a location name.");
      return;
    }
    setError(null);
    onSave(values);
  }

  return (
    <form
      onSubmit={submit}
      className="bg-muted/40 space-y-3 rounded-lg border p-3"
    >
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            value={values.name}
            disabled={busy}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-address`}>Address</Label>
          <Input
            id={`${id}-address`}
            value={values.address}
            disabled={busy}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                address: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-contact-name`}>Contact name</Label>
          <Input
            id={`${id}-contact-name`}
            value={values.contactName}
            disabled={busy}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                contactName: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-contact-email`}>Contact email</Label>
          <Input
            id={`${id}-contact-email`}
            type="email"
            value={values.contactEmail}
            disabled={busy}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                contactEmail: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-contact-phone`}>Contact phone</Label>
          <Input
            id={`${id}-contact-phone`}
            value={values.contactPhone}
            disabled={busy}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                contactPhone: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-status`}>Arrangement status</Label>
          <Select
            value={values.status}
            disabled={busy}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                status: value as ProductionLocationValues["status"],
              }))
            }
          >
            <SelectTrigger id={`${id}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCTION_LOCATION_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {productionLocationStatusLabel[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <textarea
          id={`${id}-description`}
          value={values.description}
          disabled={busy}
          rows={2}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          className="border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save location"}
        </Button>
      </div>
    </form>
  );
}

export function ProductionLocationsPanel({
  productionId,
  canManage,
}: {
  productionId: string;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["production-locations", productionId],
    queryFn: ({ signal }) => listProductionLocations(productionId, signal),
    retry: false,
  });

  const locations = query.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {locations.length} location{locations.length === 1 ? "" : "s"}
        </p>
        {canManage && !adding ? (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            Add location
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading locations…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Locations could not be loaded.
        </p>
      ) : locations.length === 0 && !adding ? (
        <p className="text-muted-foreground text-sm">
          No locations recorded yet.
        </p>
      ) : null}

      {adding ? (
        <LocationForm
          busy={busyId === "new"}
          onCancel={() => setAdding(false)}
          onSave={async (values) => {
            setBusyId("new");
            try {
              await createProductionLocation(productionId, values);
              await query.refetch();
              setAdding(false);
            } finally {
              setBusyId(null);
            }
          }}
        />
      ) : null}

      <ul className="space-y-2">
        {locations.map((location) =>
          editingId === location.id ? (
            <li key={location.id}>
              <LocationForm
                initial={{
                  name: location.name,
                  address: location.address ?? "",
                  description: location.description ?? "",
                  contactName: location.contactName ?? "",
                  contactEmail: location.contactEmail ?? "",
                  contactPhone: location.contactPhone ?? "",
                  status: location.status,
                  notes: location.notes ?? "",
                }}
                busy={busyId === location.id}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  setBusyId(location.id);
                  try {
                    await updateProductionLocation(
                      productionId,
                      location.id,
                      values,
                    );
                    await query.refetch();
                    setEditingId(null);
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
            </li>
          ) : (
            <li
              key={location.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{location.name}</p>
                {location.address ? (
                  <p className="text-muted-foreground text-xs">
                    {location.address}
                  </p>
                ) : null}
                {location.contactName || location.contactEmail ? (
                  <p className="text-muted-foreground text-xs">
                    {[location.contactName, location.contactEmail]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[location.status]}>
                  {productionLocationStatusLabel[location.status]}
                </Badge>
                {canManage ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(location.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === location.id}
                      onClick={async () => {
                        setBusyId(location.id);
                        try {
                          await deleteProductionLocation(
                            productionId,
                            location.id,
                          );
                          await query.refetch();
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
