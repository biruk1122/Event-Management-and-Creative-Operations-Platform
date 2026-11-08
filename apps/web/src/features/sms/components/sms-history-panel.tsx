"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table } from "@/components/ui/table";
import { useSmsMessages } from "../api/sms-queries";
import type { SmsHistoryFilters, SmsRecipient } from "../api/sms-gateway";
import {
  categoryLabel,
  reasonLabel,
  statusLabel,
  SMS_STATUS_LABELS,
  type SmsTone,
} from "../lib/sms-labels";
import { SmsMessageDialog } from "./sms-message-dialog";
import { SmsRecipientPicker } from "./sms-recipient-picker";

const PAGE_SIZE = 25;
const CATEGORIES = [
  "TEST",
  "TASK_ASSIGNED",
  "TASK_REMINDER",
  "TASK_OVERDUE",
  "MEETING_INVITATION",
  "MEETING_CHANGED",
  "MEETING_REMINDER",
  "MEETING_CANCELLED",
  "REPORT_SUBMITTED",
];

const TONE_CLASS: Record<
  SmsTone,
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "information"
  | "secondary"
> = {
  neutral: "secondary",
  info: "information",
  success: "success",
  warning: "warning",
  danger: "destructive",
};

/** The start of a local calendar day, as an ISO instant. */
function startOfDay(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

/** The end of a local calendar day, as an ISO instant. */
function endOfDay(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

export function SmsHistoryPanel({ canUpdate }: { canUpdate: boolean }) {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [recipient, setRecipient] = useState<SmsRecipient | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const rangeInvalid = from !== "" && to !== "" && from > to;

  const filters: SmsHistoryFilters = {
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(recipient ? { recipientUserId: recipient.id } : {}),
    ...(from && !rangeInvalid ? { createdFrom: startOfDay(from) } : {}),
    ...(to && !rangeInvalid ? { createdTo: endOfDay(to) } : {}),
  };
  const messages = useSmsMessages(filters);

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const totalPages = messages.data
    ? Math.max(1, Math.ceil(messages.data.total / PAGE_SIZE))
    : 1;

  return (
    <div className="grid gap-6">
      <form
        aria-label="Filter SMS history"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="grid gap-1">
          <Label htmlFor="sms-filter-status">Status</Label>
          <select
            id="sms-filter-status"
            className="h-9 rounded-md border px-2"
            value={status}
            onChange={(event) =>
              changeFilter(() => setStatus(event.target.value))
            }
          >
            <option value="">All statuses</option>
            {Object.keys(SMS_STATUS_LABELS).map((value) => (
              <option key={value} value={value}>
                {SMS_STATUS_LABELS[value]!.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sms-filter-category">Category</Label>
          <select
            id="sms-filter-category"
            className="h-9 rounded-md border px-2"
            value={category}
            onChange={(event) =>
              changeFilter(() => setCategory(event.target.value))
            }
          >
            <option value="">All categories</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {categoryLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <SmsRecipientPicker
            selected={recipient}
            onSelect={(next) => changeFilter(() => setRecipient(next))}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sms-filter-from">Created from</Label>
          <Input
            id="sms-filter-from"
            type="date"
            value={from}
            onChange={(event) =>
              changeFilter(() => setFrom(event.target.value))
            }
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sms-filter-to">Created to</Label>
          <Input
            id="sms-filter-to"
            type="date"
            value={to}
            aria-invalid={rangeInvalid}
            onChange={(event) => changeFilter(() => setTo(event.target.value))}
          />
          {rangeInvalid ? (
            <p role="alert" className="text-sm">
              The end date must be on or after the start date.
            </p>
          ) : null}
        </div>
      </form>

      {messages.isPending ? <p role="status">Loading SMS history...</p> : null}

      {messages.isError ? (
        <div role="alert">
          <p>{messages.error.message}</p>
          <Button variant="outline" onClick={() => void messages.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {messages.data && messages.data.items.length === 0 ? (
        <p>No SMS messages match these filters.</p>
      ) : null}

      {messages.data && messages.data.items.length > 0 ? (
        <>
          <Table caption="SMS history, newest first">
            <thead>
              <tr>
                <th scope="col">Created</th>
                <th scope="col">Category</th>
                <th scope="col">Recipient</th>
                <th scope="col">Status</th>
                <th scope="col">Reason</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {messages.data.items.map((row) => {
                const status = statusLabel(row.status);
                return (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{categoryLabel(row.category)}</td>
                    <td>
                      <span>{row.recipientName ?? "Unknown recipient"}</span>{" "}
                      <span className="text-sm">
                        {row.recipientPhoneMasked ?? ""}
                      </span>
                    </td>
                    <td>
                      <Badge variant={TONE_CLASS[status.tone]}>
                        {status.label}
                      </Badge>
                    </td>
                    <td>
                      {reasonLabel(row.skipReason ?? row.lastError) ?? ""}
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => setOpenId(row.id)}>
                        View details
                        <span className="sr-only">
                          {" "}
                          for {categoryLabel(row.category)}
                        </span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <nav aria-label="Pagination" className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={page <= 1 || messages.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= totalPages || messages.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </nav>
        </>
      ) : null}

      <SmsMessageDialog
        id={openId}
        canUpdate={canUpdate}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </div>
  );
}
