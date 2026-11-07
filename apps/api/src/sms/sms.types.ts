/** A message still SENDING after this long is treated as UNCERTAIN. It is never resent automatically. */
export const SMS_SENDING_TIMEOUT_MS = 5 * 60_000;

/** Consumer that delivers SMS through the transactional outbox (ADR 0004). */
export const SMS_CONSUMER_NAME = "sms";
export const SMS_CONSUMER_VERSION = 1;

/** Categories an SMS can belong to. Phase 1 has only the connection test. */
export const SMS_CATEGORIES = [
  "TEST",
  "TASK_ASSIGNED",
  "TASK_REMINDER",
  "TASK_OVERDUE",
] as const;
export type SmsCategory = (typeof SMS_CATEGORIES)[number];

/** Statuses reflect what the provider actually returned. `DELIVERED` is reserved until the provider's status mapping is verified. */
export const SMS_STATUSES = [
  "PENDING",
  "SENDING",
  "ACCEPTED",
  "DELIVERED",
  "FAILED",
  "UNCERTAIN",
  "CANCELLED",
  "SKIPPED",
] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

/** Provider response fields we keep. Everything else is dropped before storage. */
export interface SanitizedProviderResponse {
  acknowledge?: string | undefined;
  status?: string | undefined;
  message?: string | undefined;
  description?: string | undefined;
}

export type SendOutcome =
  | {
      kind: "ACCEPTED";
      providerMessageId: string;
      httpStatus: number;
      response: SanitizedProviderResponse;
    }
  /** The provider definitively refused the request. Safe to mark FAILED. */
  | {
      kind: "REJECTED";
      httpStatus: number | null;
      error: string;
      response: SanitizedProviderResponse | null;
    }
  /** Timeout, network error, server error, or an unreadable success. The message may have been sent. */
  | { kind: "UNCERTAIN"; error: string };

export type StatusOutcome =
  | {
      kind: "OK";
      providerStatus: string;
      description: string | null;
    }
  | { kind: "ERROR"; error: string; rateLimited: boolean };

export type BalanceOutcome =
  | { kind: "OK"; balance: string; estimatedMessages: string }
  | { kind: "ERROR"; error: string };

export interface SendRequest {
  /** Normalized E.164 number, for example +251912345678. */
  to: string;
  message: string;
  sender: string;
  identifierId?: string;
}

/** The only surface business code and the consumer use. A second provider implements the same interface. */
export interface SmsProvider {
  send(request: SendRequest): Promise<SendOutcome>;
  getStatus(providerMessageId: string): Promise<StatusOutcome>;
  getBalance(): Promise<BalanceOutcome>;
}

export const SMS_PROVIDER = Symbol("SMS_PROVIDER");
