import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RealtimeEnvelope } from "./realtime.contracts.js";
import { RealtimeService } from "./realtime.service.js";

type Emit = (event: string, envelope: RealtimeEnvelope) => void;

const now = () => new Date();

describe("RealtimeService", () => {
  let accessTokens: { verify: ReturnType<typeof vi.fn> };
  let authRepository: { isSessionActive: ReturnType<typeof vi.fn> };
  let permissions: { hasGrant: ReturnType<typeof vi.fn> };
  let workspaces: { findById: ReturnType<typeof vi.fn> };
  let service: RealtimeService;

  beforeEach(() => {
    accessTokens = { verify: vi.fn() };
    authRepository = { isSessionActive: vi.fn() };
    permissions = { hasGrant: vi.fn() };
    workspaces = { findById: vi.fn() };
    service = new RealtimeService(
      accessTokens as never,
      authRepository as never,
      permissions as never,
      workspaces as never,
    );
  });

  describe("authenticateHandshake", () => {
    it("returns null when the cookie header is missing", async () => {
      expect(await service.authenticateHandshake(undefined)).toBeNull();
      expect(accessTokens.verify).not.toHaveBeenCalled();
    });

    it("returns null when the access_token cookie is absent", async () => {
      expect(await service.authenticateHandshake("csrf_token=abc")).toBeNull();
      expect(accessTokens.verify).not.toHaveBeenCalled();
    });

    it("returns null when the JWT does not verify", async () => {
      accessTokens.verify.mockResolvedValue(null);
      expect(
        await service.authenticateHandshake("access_token=bad-jwt"),
      ).toBeNull();
    });

    it("returns null when the referenced session is not active", async () => {
      accessTokens.verify.mockResolvedValue({ sub: "u1", sid: "s1" });
      authRepository.isSessionActive.mockResolvedValue(false);
      expect(
        await service.authenticateHandshake("access_token=good-jwt"),
      ).toBeNull();
      expect(authRepository.isSessionActive).toHaveBeenCalledWith("s1");
    });

    it("resolves the user and session id for a valid, active session", async () => {
      accessTokens.verify.mockResolvedValue({ sub: "u1", sid: "s1" });
      authRepository.isSessionActive.mockResolvedValue(true);
      await expect(
        service.authenticateHandshake("access_token=good-jwt; csrf_token=x"),
      ).resolves.toEqual({ userId: "u1", sessionId: "s1" });
    });
  });

  describe("authorizeWorkspaceRoom", () => {
    it("returns not_found for an unknown workspace", async () => {
      workspaces.findById.mockResolvedValue(null);
      expect(await service.authorizeWorkspaceRoom("u1", "ws-1")).toBe(
        "not_found",
      );
      expect(permissions.hasGrant).not.toHaveBeenCalled();
    });

    it("resolves the read key for the workspace's kind and checks it at ORGANIZATION scope", async () => {
      workspaces.findById.mockResolvedValue({ id: "ws-1", kind: "PROJECT" });
      permissions.hasGrant.mockResolvedValue(true);
      expect(await service.authorizeWorkspaceRoom("u1", "ws-1")).toBe("ok");
      expect(permissions.hasGrant).toHaveBeenCalledWith(
        "u1",
        "project.read",
        "ORGANIZATION",
      );
    });

    it("returns denied when the caller lacks the grant", async () => {
      workspaces.findById.mockResolvedValue({ id: "ws-1", kind: "EVENT" });
      permissions.hasGrant.mockResolvedValue(false);
      expect(await service.authorizeWorkspaceRoom("u1", "ws-1")).toBe("denied");
    });

    it("maps CAMPAIGN and PRODUCTION kinds to their owning module's read key", async () => {
      workspaces.findById.mockResolvedValue({ id: "ws-1", kind: "CAMPAIGN" });
      permissions.hasGrant.mockResolvedValue(true);
      await service.authorizeWorkspaceRoom("u1", "ws-1");
      expect(permissions.hasGrant).toHaveBeenCalledWith(
        "u1",
        "campaign.read",
        "ORGANIZATION",
      );

      workspaces.findById.mockResolvedValue({
        id: "ws-2",
        kind: "PRODUCTION",
      });
      await service.authorizeWorkspaceRoom("u1", "ws-2");
      expect(permissions.hasGrant).toHaveBeenCalledWith(
        "u1",
        "project.read",
        "ORGANIZATION",
      );
    });
  });

  describe("publish", () => {
    it("drops the frame and logs when no server is attached yet", () => {
      expect(() =>
        service.publish("user:u1", "test.event", 1, { a: 1 }),
      ).not.toThrow();
    });

    it("builds the versioned envelope and emits it to the room", () => {
      const emit = vi.fn<Emit>();
      const to = vi.fn(() => ({ emit }));
      service.attachServer({ to } as never);

      const before = now().getTime();
      service.publish("workspace:w1", "workspace.updated", 2, { x: true });
      const after = now().getTime();

      expect(to).toHaveBeenCalledWith("workspace:w1");
      expect(emit).toHaveBeenCalledTimes(1);
      const [eventName, envelope] = emit.mock.calls[0]!;
      expect(eventName).toBe("workspace.updated");
      expect(envelope).toMatchObject({
        event: "workspace.updated",
        version: 2,
        room: "workspace:w1",
        payload: { x: true },
      });
      expect(typeof envelope.eventId).toBe("string");
      expect(envelope.eventId).toHaveLength(36);
      const occurredAtMs = new Date(envelope.occurredAt).getTime();
      expect(occurredAtMs).toBeGreaterThanOrEqual(before);
      expect(occurredAtMs).toBeLessThanOrEqual(after);
    });

    it("preserves a caller-supplied eventId instead of generating one", () => {
      const emit = vi.fn<Emit>();
      const to = vi.fn(() => ({ emit }));
      service.attachServer({ to } as never);

      service.publish(
        "user:u1",
        "notification.invalidated",
        1,
        { id: "n1" },
        "fixed-event-id",
      );

      const [, envelope] = emit.mock.calls[0]!;
      expect(envelope.eventId).toBe("fixed-event-id");
    });
  });
});
