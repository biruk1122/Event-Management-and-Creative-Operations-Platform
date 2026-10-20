import type { SessionEvent, SessionUser } from "./session-events";

type Lock = <T>(action: () => Promise<T>) => Promise<T>;
type Options = {
  baseUrl: string;
  fetch?: typeof fetch;
  csrf: () => string | null;
  onEvent: (event: SessionEvent) => void;
  lock?: Lock;
};

/** Owns browser session rotation. Server API clients never use this transport. */
export function createSessionTransport(options: Options) {
  const origin = new URL(options.baseUrl).origin;
  const raw =
    options.fetch ??
    ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  let actor: string | null = null;
  let revision = 0;
  let renewal: Promise<SessionUser | null> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let channel: BroadcastChannel | null = null;
  const lock: Lock | undefined =
    options.lock ??
    (typeof navigator !== "undefined" && navigator.locks
      ? async <T>(action: () => Promise<T>): Promise<T> =>
          await navigator.locks.request("lela-session-transition", action)
      : undefined);
  const serialize: Lock = (action) => {
    if (lock) return lock(action);
    const next = queue.then(action, action);
    queue = next.catch(() => {});
    return next;
  };
  const emit = (event: SessionEvent, broadcast = true) => {
    options.onEvent(event);
    if (broadcast) channel?.postMessage({ type: event.type });
  };
  const end = () => {
    actor = null;
    revision++;
    emit({ type: "ended" });
  };
  const me = async () => {
    const response = await raw(`${origin}/api/v1/auth/me`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) return null;
    if (!response.ok)
      throw new Error("Session verification is temporarily unavailable.");
    return (await response.json()) as SessionUser;
  };
  const accept = (user: SessionUser, expected: string | null) => {
    if (expected && expected !== user.id) {
      actor = user.id;
      revision++;
      emit({ type: "changed", user });
      return null;
    }
    actor = user.id;
    emit({ type: "renewed", user });
    return user;
  };
  const recover = (): Promise<SessionUser | null> => {
    if (renewal) return renewal;
    if (!lock || !options.csrf()) {
      end();
      return Promise.resolve(null);
    }
    const expected = actor;
    const generation = revision;
    renewal = serialize(async () => {
      if (generation !== revision) return null;
      // A different tab may already have rotated cookies while we waited.
      const current = await me();
      if (generation !== revision) return null;
      if (current) return accept(current, expected);
      const token = options.csrf();
      if (!token) {
        end();
        return null;
      }
      const response = await raw(`${origin}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "x-csrf-token": token, accept: "application/json" },
      });
      if (generation !== revision) return null;
      if (response.status === 401 || response.status === 403) {
        end();
        return null;
      }
      if (!response.ok)
        throw new Error(
          "Session renewal is temporarily unavailable. Please try again.",
        );
      const body = (await response.json()) as { user: SessionUser };
      if (generation !== revision) return null;
      return accept(body.user, expected);
    }).finally(() => {
      renewal = null;
    });
    return renewal;
  };
  const headers = (request: Request) => {
    const value = new Headers(request.headers);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const token = options.csrf();
      if (token) value.set("x-csrf-token", token);
      else value.delete("x-csrf-token");
    }
    return value;
  };
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith("/api/v1/"))
      return raw(request);
    if (["/api/v1/auth/login", "/api/v1/auth/logout"].includes(url.pathname)) {
      revision++;
      return serialize(async () => {
        const response = await raw(
          new Request(request, { headers: headers(request) }),
        );
        if (response.ok) {
          if (url.pathname.endsWith("/logout")) end();
          else {
            const body = (await response.clone().json()) as {
              user: SessionUser;
            };
            actor = body.user.id;
            emit({ type: "changed", user: body.user });
          }
        }
        return response;
      });
    }
    if (url.pathname === "/api/v1/auth/refresh") return raw(request);
    const copy = request.clone();
    const generation = revision;
    const response = await raw(request);
    if (response.status !== 401) {
      if (
        response.ok &&
        ["/api/v1/auth/me", "/api/v1/auth/me/permissions"].includes(
          url.pathname,
        )
      ) {
        const identity = (await response.clone().json()) as {
          id?: string;
          userId?: string;
        };
        const id = identity.id ?? identity.userId;
        if (id && generation === revision) {
          if (actor && actor !== id) {
            const current = await me();
            if (current && generation === revision) {
              actor = current.id;
              revision++;
              emit({ type: "changed", user: current });
            }
          } else actor = id;
        }
      }
      return response;
    }
    if (generation !== revision || request.signal.aborted) return response;
    const restored = await recover();
    if (!restored || generation !== revision) return response;
    request.signal.throwIfAborted();
    // Authentication guards reject before side effects; replay exactly once.
    const retried = await raw(new Request(copy, { headers: headers(copy) }));
    if (
      retried.status === 401 &&
      generation === revision &&
      !request.signal.aborted
    )
      end();
    return retried;
  };
  const start = () => {
    if (typeof window === "undefined" || !window.BroadcastChannel)
      return () => {};
    channel = new window.BroadcastChannel("lela-session");
    channel.onmessage = (message: MessageEvent<{ type?: string }>) => {
      if (message.data?.type === "ended") {
        actor = null;
        revision++;
        emit({ type: "ended" }, false);
      } else if (["changed", "renewed"].includes(message.data?.type ?? "")) {
        const generation = revision;
        void serialize(async () => {
          if (generation !== revision) return;
          const current = await me();
          if (generation !== revision) return;
          if (!current) {
            actor = null;
            revision++;
            emit({ type: "ended" }, false);
            return;
          }
          const changed = actor !== current.id;
          if (changed) revision++;
          actor = current.id;
          emit({ type: changed ? "changed" : "renewed", user: current }, false);
        }).catch(() => {});
      }
    };
    return () => {
      channel?.close();
      channel = null;
    };
  };
  return { fetch: transport, recover, start };
}
