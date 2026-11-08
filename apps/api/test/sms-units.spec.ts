/* eslint-disable @typescript-eslint/require-await -- fetch test doubles return promises without awaiting anything */
import { describe, expect, it, vi } from "vitest";

import {
  AfroMessageProvider,
  type FetchLike,
} from "../src/sms/providers/afromessage.provider.js";
import { maskPhone, normalizeEthiopianPhone } from "../src/sms/phone.js";
import { StatusCheckRateLimiter } from "../src/sms/sms-rate-limiter.js";
import { renderTemplate } from "../src/sms/templates.js";
import { logUrl } from "../src/common/http/log-url.js";

const API_KEY = "secret-api-key-value-do-not-leak";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function providerWith(fetchImpl: FetchLike): AfroMessageProvider {
  return new AfroMessageProvider(
    {
      baseUrl: "https://api.afromessage.com/api",
      apiKey: API_KEY,
      timeoutMs: 5000,
    },
    fetchImpl,
  );
}

const SEND = {
  to: "+251912345678",
  message: "LELA: test",
  sender: "LELA",
};

describe("Ethiopian phone normalization", () => {
  it.each([
    ["0912345678", "+251912345678"],
    ["912345678", "+251912345678"],
    ["+251 91 234 5678", "+251912345678"],
    ["251912345678", "+251912345678"],
    ["0711223344", "+251711223344"],
  ])("accepts %s as %s", (input, expected) => {
    expect(normalizeEthiopianPhone(input)).toEqual({
      ok: true,
      e164: expected,
    });
  });

  it.each(["", "   ", null, undefined])(
    "reports a missing phone for %j",
    (input) => {
      expect(normalizeEthiopianPhone(input)).toEqual({
        ok: false,
        reason: "MISSING_PHONE_NUMBER",
      });
    },
  );

  it.each(["0112345678", "+14155550123", "12345", "+2519123456789", "abc"])(
    "rejects %s as invalid",
    (input) => {
      expect(normalizeEthiopianPhone(input)).toEqual({
        ok: false,
        reason: "INVALID_PHONE_NUMBER",
      });
    },
  );

  it("masks everything but the country code and last three digits", () => {
    expect(maskPhone("+251912345678")).toBe("+251******678");
    expect(maskPhone(null)).toBeNull();
  });
});

describe("status-check rate limiter", () => {
  it("allows one call every two seconds and blocks the next within the gap", () => {
    let now = 0;
    const limiter = new StatusCheckRateLimiter(() => now);
    expect(limiter.tryAcquire()).toBe(true);
    now = 1000;
    expect(limiter.tryAcquire()).toBe(false);
    now = 2000;
    expect(limiter.tryAcquire()).toBe(true);
  });

  it("never allows more than 30 calls in any rolling minute", () => {
    let now = 0;
    const limiter = new StatusCheckRateLimiter(() => now);
    const allowed: number[] = [];
    for (; now <= 180_000; now += 100) {
      if (limiter.tryAcquire()) allowed.push(now);
    }
    expect(allowed.length).toBeGreaterThan(0);
    for (const start of allowed) {
      const inWindow = allowed.filter(
        (at) => at >= start && at < start + 60_000,
      );
      expect(inWindow.length).toBeLessThanOrEqual(30);
    }
  });

  it("blocks for two minutes after the provider reports a rate limit", () => {
    let now = 0;
    const limiter = new StatusCheckRateLimiter(() => now);
    limiter.block();
    now = 119_000;
    expect(limiter.tryAcquire()).toBe(false);
    now = 121_000;
    expect(limiter.tryAcquire()).toBe(true);
  });
});

describe("AfroMessage provider outcomes", () => {
  it("returns ACCEPTED with the provider message id and a sanitized response", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        acknowledge: "success",
        response: {
          status: "Send in progress...",
          message_id: "9ab2867c-96ce-4405-b890-8d35d52c8e01",
          message: "LELA: test",
          to: "+251912345678",
        },
      }),
    );
    const outcome = await providerWith(fetchImpl).send(SEND);
    expect(outcome).toMatchObject({
      kind: "ACCEPTED",
      providerMessageId: "9ab2867c-96ce-4405-b890-8d35d52c8e01",
      httpStatus: 200,
    });
    const sent = fetchImpl.mock.calls[0]![1].body as string;
    const body: unknown = JSON.parse(sent);
    expect(body).toEqual({
      sender: "LELA",
      to: "+251912345678",
      message: "LELA: test",
    });
    const headers = fetchImpl.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it("omits the sender when none is configured and sends from the identifier", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        acknowledge: "success",
        response: { status: "ok", message_id: "id-2" },
      }),
    );
    await providerWith(fetchImpl).send({
      ...SEND,
      sender: "",
      identifierId: "e80ad9d8-adf3-463f-80f4-7c4b39f7f164",
    });
    const body: unknown = JSON.parse(
      fetchImpl.mock.calls[0]![1].body as string,
    );
    expect(body).toEqual({
      to: "+251912345678",
      message: "LELA: test",
      from: "e80ad9d8-adf3-463f-80f4-7c4b39f7f164",
    });
  });

  it("never returns the API key or the recipient phone in any outcome", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        acknowledge: "success",
        response: { status: "ok", message_id: "id-1", to: "+251912345678" },
        apiKey: API_KEY,
      }),
    );
    const outcome = await providerWith(fetchImpl).send(SEND);
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain("+251912345678");
  });

  it("treats an acknowledged failure as REJECTED, with sanitized detail only", async () => {
    const outcome = await providerWith(async () =>
      jsonResponse(200, {
        acknowledge: "error",
        response: { message: "bad sender", to: "+251912345678" },
      }),
    ).send(SEND);
    expect(outcome.kind).toBe("REJECTED");
    expect(JSON.stringify(outcome)).not.toContain("+251912345678");
  });

  it("treats a client error as REJECTED", async () => {
    const outcome = await providerWith(async () =>
      jsonResponse(401, { acknowledge: "error" }),
    ).send(SEND);
    expect(outcome).toMatchObject({ kind: "REJECTED", httpStatus: 401 });
  });

  it("treats a server error as UNCERTAIN, never as a definite failure", async () => {
    const outcome = await providerWith(async () => jsonResponse(500, {})).send(
      SEND,
    );
    expect(outcome.kind).toBe("UNCERTAIN");
  });

  it("treats a timeout as UNCERTAIN", async () => {
    const outcome = await providerWith(async () => {
      throw new DOMException("timed out", "TimeoutError");
    }).send(SEND);
    expect(outcome).toMatchObject({
      kind: "UNCERTAIN",
      error: "provider request timed out",
    });
  });

  it("treats a network failure as UNCERTAIN", async () => {
    const outcome = await providerWith(async () => {
      throw new TypeError("fetch failed");
    }).send(SEND);
    expect(outcome.kind).toBe("UNCERTAIN");
  });

  it("treats an acknowledgement without a message id as UNCERTAIN", async () => {
    const outcome = await providerWith(async () =>
      jsonResponse(200, {
        acknowledge: "success",
        response: { status: "queued" },
      }),
    ).send(SEND);
    expect(outcome.kind).toBe("UNCERTAIN");
  });

  it("treats an unreadable success body as UNCERTAIN", async () => {
    const outcome = await providerWith(
      async () => new Response("<html>", { status: 200 }),
    ).send(SEND);
    expect(outcome.kind).toBe("UNCERTAIN");
  });

  it("reads a status and flags a rate-limit response", async () => {
    const ok = await providerWith(async () =>
      jsonResponse(200, {
        acknowledge: "success",
        response: {
          messageId: "id-1",
          status: "UNDELIV",
          description: "Undelivered...",
        },
      }),
    ).getStatus("id-1");
    expect(ok).toEqual({
      kind: "OK",
      providerStatus: "UNDELIV",
      description: "Undelivered...",
    });

    const limited = await providerWith(
      async () => new Response("", { status: 429 }),
    ).getStatus("id-1");
    expect(limited).toMatchObject({ kind: "ERROR", rateLimited: true });
  });

  it("reads the balance without exposing the key", async () => {
    const outcome = await providerWith(async () =>
      jsonResponse(200, {
        acknowledge: "success",
        response: { balance: "205.65", estimatedMessages: "3577" },
      }),
    ).getBalance();
    expect(outcome).toEqual({
      kind: "OK",
      balance: "205.65",
      estimatedMessages: "3577",
    });
  });
});

describe("central templates", () => {
  it("renders the connection-test template", () => {
    expect(renderTemplate("TEST_CONNECTION")).toContain("connection test");
  });
});

describe("request log URLs", () => {
  it("strips the query string and redacts the SMS callback token", () => {
    expect(
      logUrl("/api/v1/sms/callbacks/super-secret-token?message_id=1&status=OK"),
    ).toBe("/api/v1/sms/callbacks/[REDACTED]");
  });

  it("leaves ordinary paths alone apart from the query string", () => {
    expect(logUrl("/api/v1/tasks/abc?page=2")).toBe("/api/v1/tasks/abc");
    expect(logUrl(undefined)).toBeUndefined();
  });
});
