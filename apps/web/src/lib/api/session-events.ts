import type { components } from "@event-platform/api-client";

export type SessionUser = components["schemas"]["AuthenticatedUserResponse"];
export type SessionEvent =
  { type: "renewed" | "changed"; user: SessionUser } | { type: "ended" };

const listeners = new Set<(event: SessionEvent) => void>();
export function publishSessionEvent(event: SessionEvent) {
  for (const listener of listeners) listener(event);
}
export function subscribeSessionEvents(
  listener: (event: SessionEvent) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
