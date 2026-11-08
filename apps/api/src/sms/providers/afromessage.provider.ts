import type {
  BalanceOutcome,
  SanitizedProviderResponse,
  SendOutcome,
  SendRequest,
  SmsProvider,
  StatusOutcome,
} from "../sms.types.js";

export interface AfroMessageConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const MAX_STORED_TEXT = 300;

/**
 * AfroMessage adapter, written against the documented API
 * (api.afromessage.com/api): `POST /send`, `GET /status`, `GET /balance`.
 *
 * Outcomes are conservative. Only a definite refusal is `REJECTED`. A
 * timeout, network error, server error, or unreadable success is `UNCERTAIN`,
 * because the message may already have been sent and must not be resent
 * automatically. The API key is only ever placed in the Authorization header
 * and is never returned, logged, or stored.
 */
export class AfroMessageProvider implements SmsProvider {
  constructor(
    private readonly config: AfroMessageConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async send(request: SendRequest): Promise<SendOutcome> {
    const body: Record<string, string> = {
      sender: request.sender,
      to: request.to,
      message: request.message,
    };
    if (request.identifierId) body.from = request.identifierId;

    const result = await this.call("POST", "/send", body);
    if (result.kind === "NETWORK") {
      return { kind: "UNCERTAIN", error: result.error };
    }
    const { httpStatus, json } = result;

    if (httpStatus >= 500) {
      return {
        kind: "UNCERTAIN",
        error: `provider server error (${httpStatus})`,
      };
    }
    if (httpStatus >= 200 && httpStatus < 300 && json === null) {
      // A success status with an unreadable body: the send may have happened.
      return {
        kind: "UNCERTAIN",
        error: "provider returned an unreadable response",
      };
    }
    const response = sanitize(json);
    if (
      httpStatus >= 400 ||
      !isObject(json) ||
      json.acknowledge !== "success"
    ) {
      return {
        kind: "REJECTED",
        httpStatus,
        error: `provider rejected the request (${httpStatus})`,
        response,
      };
    }
    const messageId = isObject(json.response)
      ? json.response.message_id
      : undefined;
    if (typeof messageId !== "string" || messageId.length === 0) {
      // Acknowledged but no message id: the send may have happened, so do not resend.
      return {
        kind: "UNCERTAIN",
        error: "provider acknowledged without a message id",
      };
    }
    return {
      kind: "ACCEPTED",
      providerMessageId: messageId,
      httpStatus,
      response,
    };
  }

  async getStatus(providerMessageId: string): Promise<StatusOutcome> {
    const result = await this.call(
      "GET",
      `/status?id=${encodeURIComponent(providerMessageId)}`,
    );
    if (result.kind === "NETWORK") {
      return { kind: "ERROR", error: result.error, rateLimited: false };
    }
    if (result.httpStatus === 429) {
      return {
        kind: "ERROR",
        error: "status check rate limited",
        rateLimited: true,
      };
    }
    const { json, httpStatus } = result;
    const inner =
      isObject(json) && isObject(json.response) ? json.response : null;
    if (
      httpStatus >= 400 ||
      !isObject(json) ||
      json.acknowledge !== "success" ||
      !inner
    ) {
      return {
        kind: "ERROR",
        error: `status check failed (${httpStatus})`,
        rateLimited: false,
      };
    }
    return {
      kind: "OK",
      providerStatus:
        typeof inner.status === "string" ? truncate(inner.status) : "UNKNOWN",
      description:
        typeof inner.description === "string"
          ? truncate(inner.description)
          : null,
    };
  }

  async getBalance(): Promise<BalanceOutcome> {
    const result = await this.call("GET", "/balance");
    if (result.kind === "NETWORK")
      return { kind: "ERROR", error: result.error };
    const { json, httpStatus } = result;
    const inner =
      isObject(json) && isObject(json.response) ? json.response : null;
    if (
      httpStatus >= 400 ||
      !isObject(json) ||
      json.acknowledge !== "success" ||
      !inner
    ) {
      return { kind: "ERROR", error: `balance check failed (${httpStatus})` };
    }
    return {
      kind: "OK",
      balance: asText(inner.balance),
      estimatedMessages: asText(inner.estimatedMessages),
    };
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, string>,
  ): Promise<
    | { kind: "OK"; httpStatus: number; json: unknown }
    | { kind: "NETWORK"; error: string }
  > {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { kind: "OK", httpStatus: response.status, json };
    } catch (error) {
      return { kind: "NETWORK", error: describeNetworkError(error) };
    }
  }
}

function describeNetworkError(error: unknown): string {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "provider request timed out";
  }
  return "provider request failed to complete";
}

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string): string {
  return value.length > MAX_STORED_TEXT
    ? value.slice(0, MAX_STORED_TEXT)
    : value;
}

/** Keeps only the fields we need. Credentials, phone numbers and unknown fields are dropped. */
function sanitize(json: unknown): SanitizedProviderResponse {
  if (!isObject(json)) return {};
  const inner = isObject(json.response) ? json.response : {};
  const pick = (value: unknown): string | undefined =>
    typeof value === "string" ? truncate(value) : undefined;
  return {
    acknowledge: pick(json.acknowledge),
    status: pick(inner.status),
    message: pick(inner.message),
    description: pick(inner.description),
  };
}
