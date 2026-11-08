"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSmsMessage,
  getSmsSettings,
  listSmsMessages,
  resolveSmsMessage,
  searchSmsRecipients,
  testSmsConnection,
  updateSmsSettings,
  type SmsHistoryFilters,
  type SmsResolutionDecision,
} from "./sms-gateway";

export const smsKeys = {
  settings: ["sms", "settings"] as const,
  messages: (filters: SmsHistoryFilters) =>
    ["sms", "messages", filters] as const,
  message: (id: string) => ["sms", "message", id] as const,
  recipients: (query: string) => ["sms", "recipients", query] as const,
};

export function useSmsSettings() {
  return useQuery({
    queryKey: smsKeys.settings,
    queryFn: ({ signal }) => getSmsSettings(signal),
    retry: false,
  });
}

export function useUpdateSmsSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateSmsSettings,
    onSuccess: (settings) => {
      client.setQueryData(smsKeys.settings, settings);
    },
  });
}

export function useSmsMessages(filters: SmsHistoryFilters) {
  return useQuery({
    queryKey: smsKeys.messages(filters),
    queryFn: ({ signal }) => listSmsMessages(filters, signal),
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useSmsMessage(id: string | null) {
  return useQuery({
    queryKey: smsKeys.message(id ?? ""),
    queryFn: ({ signal }) => getSmsMessage(id ?? "", signal),
    enabled: id !== null,
    retry: false,
  });
}

/** Resolves an uncertain message, then reloads it and the history so the new status shows. */
export function useResolveSmsMessage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: SmsResolutionDecision) =>
      resolveSmsMessage(id, decision),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: smsKeys.message(id) });
      await client.invalidateQueries({ queryKey: ["sms", "messages"] });
    },
  });
}

/** Recipient search. Runs only for a query of two or more characters. */
export function useSmsRecipientSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: smsKeys.recipients(term),
    queryFn: ({ signal }) => searchSmsRecipients(term, signal),
    enabled: term.length >= 2,
    retry: false,
  });
}

export function useSmsConnectionTest() {
  return useMutation({ mutationFn: testSmsConnection });
}
