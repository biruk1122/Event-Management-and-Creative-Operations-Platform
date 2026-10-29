import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionTransport } from "./session-transport";
import type { SessionEvent } from "./session-events";

const origin = "http://localhost:4000";
const user = {
  id: "actor-a",
  email: "a@example.test",
  status: "ACTIVE" as const,
};
const unauthorized = () => Response.json({ status: 401 }, { status: 401 });
const request = (path = "/api/v1/reports", init?: RequestInit) =>
  new Request(origin + path, { credentials: "include", ...init });
function sharedLock() {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(action: () => Promise<T>): Promise<T> => {
    const next = queue.then(action, action);
    queue = next.catch(() => {});
    return next;
  };
}
describe("browser session transport", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("requires sign-in when safe browser locking is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const raw = vi.fn<typeof fetch>(async () => unauthorized());
    const onEvent = vi.fn();
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      onEvent,
    });
    expect((await transport.fetch(request())).status).toBe(401);
    expect(raw).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({ type: "ended" });
  });
  it.each(["login", "logout", "refresh"])(
    "never automatically retries an explicit %s request",
    async (operation) => {
      const raw = vi.fn<typeof fetch>(async () => unauthorized());
      const transport = createSessionTransport({
        baseUrl: origin,
        fetch: raw,
        csrf: () => "csrf",
        lock: sharedLock(),
        onEvent: vi.fn(),
      });
      expect(
        (
          await transport.fetch(
            request(`/api/v1/auth/${operation}`, { method: "POST" }),
          )
        ).status,
      ).toBe(401);
      expect(raw).toHaveBeenCalledOnce();
    },
  );
  it("does not renew after network failure", async () => {
    const raw = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Network unavailable"));
    const onEvent = vi.fn();
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent,
    });
    await expect(transport.fetch(request())).rejects.toThrow(
      "Network unavailable",
    );
    expect(raw).toHaveBeenCalledOnce();
    expect(onEvent).not.toHaveBeenCalled();
  });
  it("does not end a newer login when an old replay returns 401", async () => {
    let release!: (response: Response) => void;
    let replaying!: () => void;
    const ready = new Promise<void>((resolve) => {
      replaying = resolve;
    });
    let reports = 0;
    const events: SessionEvent[] = [];
    const raw = vi.fn<typeof fetch>(async (input) => {
      const url = new Request(input).url;
      if (url.endsWith("/auth/me")) return unauthorized();
      if (url.endsWith("/auth/refresh")) return Response.json({ user });
      if (url.endsWith("/auth/login"))
        return Response.json({ user: { ...user, id: "actor-b" } });
      if (++reports === 1) return unauthorized();
      replaying();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent: (event) => events.push(event),
    });
    const pending = transport.fetch(request());
    await ready;
    await transport.fetch(request("/api/v1/auth/login", { method: "POST" }));
    release(unauthorized());
    await pending;
    expect(events.map((event) => event.type)).toEqual(["renewed", "changed"]);
  });
  it("does not restore an account from a delayed identity check after logout", async () => {
    let release!: (response: Response) => void;
    let checking!: () => void;
    const ready = new Promise<void>((resolve) => {
      checking = resolve;
    });
    const events: SessionEvent[] = [];
    let reads = 0;
    const raw = vi.fn<typeof fetch>(async (input) => {
      const url = new Request(input).url;
      if (url.endsWith("/auth/logout"))
        return new Response(null, { status: 204 });
      if (url.endsWith("/auth/me/permissions"))
        return Response.json({ userId: "actor-b" });
      if (++reads === 1) return Response.json(user);
      checking();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent: (event) => events.push(event),
    });
    await transport.fetch(request("/api/v1/auth/me"));
    const pending = transport.fetch(request("/api/v1/auth/me/permissions"));
    await ready;
    await transport.fetch(request("/api/v1/auth/logout", { method: "POST" }));
    release(Response.json({ ...user, id: "actor-b" }));
    await pending;
    expect(events).toEqual([{ type: "ended" }]);
  });
  it("ignores delayed cross-tab verification after a session-ended broadcast", async () => {
    let listener!: (message: { data: { type: string } }) => void;
    class Channel {
      set onmessage(value: typeof listener) {
        listener = value;
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal("window", { BroadcastChannel: Channel });
    let release!: (response: Response) => void;
    const raw = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const events: SessionEvent[] = [];
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent: (event) => events.push(event),
    });
    const stop = transport.start();
    listener({ data: { type: "renewed" } });
    await vi.waitFor(() => expect(raw).toHaveBeenCalledOnce());
    listener({ data: { type: "ended" } });
    release(Response.json(user));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([{ type: "ended" }]);
    stop();
  });
  it("renews once for concurrent expired requests and rebuilds CSRF on a single write replay", async () => {
    let valid = false;
    let csrf = "old-csrf";
    let writes = 0;
    const raw = vi.fn<typeof fetch>(async (input, init) => {
      const req = new Request(input, init);
      if (req.url.endsWith("/auth/me"))
        return valid ? Response.json(user) : unauthorized();
      if (req.url.endsWith("/auth/refresh")) {
        expect(req.headers.get("x-csrf-token")).toBe("old-csrf");
        valid = true;
        csrf = "new-csrf";
        return Response.json({ user });
      }
      if (!valid) return unauthorized();
      if (req.method === "POST") {
        expect(req.headers.get("x-csrf-token")).toBe("new-csrf");
        expect(await req.json()).toEqual({ title: "Report" });
        writes++;
      }
      return Response.json({ ok: true });
    });
    const onEvent = vi.fn();
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => csrf,
      lock: sharedLock(),
      onEvent,
    });
    const responses = await Promise.all([
      transport.fetch(request()),
      transport.fetch(
        request("/api/v1/reports", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({ title: "Report" }),
        }),
      ),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      raw.mock.calls.filter(([input]) =>
        String(input instanceof Request ? input.url : input).endsWith(
          "/auth/refresh",
        ),
      ),
    ).toHaveLength(1);
    expect(writes).toBe(1);
  });
  it("rechecks cookies inside the cross-tab lock instead of rotating twice", async () => {
    let valid = false;
    let refreshes = 0;
    const raw = vi.fn<typeof fetch>(async (input, init) => {
      const req = new Request(input, init);
      if (req.url.endsWith("/auth/me"))
        return valid ? Response.json(user) : unauthorized();
      if (req.url.endsWith("/auth/refresh")) {
        valid = true;
        refreshes++;
        return Response.json({ user });
      }
      return valid ? Response.json({ ok: true }) : unauthorized();
    });
    const lock = sharedLock();
    const options = {
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock,
      onEvent: () => {},
    };
    const a = createSessionTransport(options),
      b = createSessionTransport(options);
    const responses = await Promise.all([
      a.fetch(request()),
      b.fetch(request()),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(refreshes).toBe(1);
  });
  it("does not replay a previous account's request with another account's cookies", async () => {
    let current = user;
    const events: SessionEvent[] = [];
    const raw = vi.fn<typeof fetch>(async (input) =>
      new Request(input).url.endsWith("/auth/me")
        ? Response.json(current)
        : unauthorized(),
    );
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent: (event) => events.push(event),
    });
    await transport.fetch(request("/api/v1/auth/me"));
    current = { ...user, id: "actor-b" };
    expect((await transport.fetch(request())).status).toBe(401);
    expect(
      raw.mock.calls.filter(([input]) =>
        new Request(input).url.endsWith("/reports"),
      ),
    ).toHaveLength(1);
    expect(events).toContainEqual({ type: "changed", user: current });
  });
  it.each([403, 500])("does not renew or retry HTTP %s", async (status) => {
    const raw = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent: vi.fn(),
    });
    expect((await transport.fetch(request())).status).toBe(status);
    expect(raw).toHaveBeenCalledOnce();
  });
  it("ends a rejected session without an unbounded retry loop", async () => {
    const onEvent = vi.fn();
    const raw = vi.fn<typeof fetch>(async () => unauthorized());
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent,
    });
    expect((await transport.fetch(request())).status).toBe(401);
    expect(raw).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenCalledWith({ type: "ended" });
  });
  it("serializes logout after renewal and never replays the old protected request", async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let csrf = "old";
    const raw = vi.fn<typeof fetch>(async (input, init) => {
      const req = new Request(input, init);
      if (req.url.endsWith("/auth/refresh")) {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        csrf = "rotated";
        return Response.json({ user });
      }
      if (req.url.endsWith("/auth/logout")) {
        expect(req.headers.get("x-csrf-token")).toBe("rotated");
        return new Response(null, { status: 204 });
      }
      return unauthorized();
    });
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => csrf,
      lock: sharedLock(),
      onEvent: vi.fn(),
    });
    const expired = transport.fetch(request());
    await ready;
    const logout = transport.fetch(
      request("/api/v1/auth/logout", { method: "POST" }),
    );
    release();
    expect((await expired).status).toBe(401);
    expect((await logout).status).toBe(204);
    expect(
      raw.mock.calls.filter(([input]) =>
        new Request(input).url.endsWith("/reports"),
      ),
    ).toHaveLength(1);
  });
  it("does not convert a temporary renewal outage into session-ended state", async () => {
    const onEvent = vi.fn();
    const raw = vi.fn<typeof fetch>(async (input) =>
      String(input instanceof Request ? input.url : input).endsWith(
        "/auth/refresh",
      )
        ? new Response(null, { status: 503 })
        : unauthorized(),
    );
    const transport = createSessionTransport({
      baseUrl: origin,
      fetch: raw,
      csrf: () => "csrf",
      lock: sharedLock(),
      onEvent,
    });
    await expect(transport.fetch(request())).rejects.toThrow(
      "temporarily unavailable",
    );
    expect(onEvent).not.toHaveBeenCalled();
  });
});
