import { describe, expect, it, vi } from "vitest";

import { SessionRegistryService } from "./session-registry.service.js";

function makeSocket() {
  return { disconnect: vi.fn() } as never as {
    disconnect: (close?: boolean) => void;
  };
}

describe("SessionRegistryService", () => {
  it("counts zero for a session with no registered sockets", () => {
    const registry = new SessionRegistryService();
    expect(registry.countForSession("s1")).toBe(0);
  });

  it("registers multiple sockets for the same session (multi-tab)", () => {
    const registry = new SessionRegistryService();
    const a = makeSocket();
    const b = makeSocket();
    registry.register("s1", a as never);
    registry.register("s1", b as never);
    expect(registry.countForSession("s1")).toBe(2);
  });

  it("unregister drops one socket without affecting the other", () => {
    const registry = new SessionRegistryService();
    const a = makeSocket();
    const b = makeSocket();
    registry.register("s1", a as never);
    registry.register("s1", b as never);

    registry.unregister("s1", a as never);

    expect(registry.countForSession("s1")).toBe(1);
  });

  it("disconnectSession disconnects every registered socket and clears the entry", () => {
    const registry = new SessionRegistryService();
    const a = makeSocket();
    const b = makeSocket();
    registry.register("s1", a as never);
    registry.register("s1", b as never);

    registry.disconnectSession("s1");

    expect(a.disconnect).toHaveBeenCalledWith(true);
    expect(b.disconnect).toHaveBeenCalledWith(true);
    expect(registry.countForSession("s1")).toBe(0);
  });

  it("disconnectSession on an unknown session is a no-op", () => {
    const registry = new SessionRegistryService();
    expect(() => registry.disconnectSession("ghost")).not.toThrow();
  });
});
