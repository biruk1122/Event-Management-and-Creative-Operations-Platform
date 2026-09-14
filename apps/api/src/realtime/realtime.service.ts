import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { parseCookie } from "cookie";
import type { Server } from "socket.io";

import { AccessTokenService } from "../auth/domain/access-token.service.js";
import { ACCESS_TOKEN_COOKIE } from "../auth/auth-cookies.js";
import { AuthRepository } from "../auth/infrastructure/auth.repository.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionsForKind } from "../workspaces/workspaces.authz.js";
import { WorkspacesRepository } from "../workspaces/infrastructure/workspaces.repository.js";
import type { RealtimeEnvelope } from "./realtime.contracts.js";

export interface AuthenticatedSocket {
  userId: string;
  sessionId: string;
}

export type WorkspaceRoomAuthorization = "ok" | "not_found" | "denied";

/**
 * Application service for `/realtime`: handshake authentication, room
 * authorization, and publishing the versioned envelope (ADR 0004). Kept free
 * of any Socket.IO gateway/lifecycle concerns so it is testable without a
 * live server and so a future producer module can depend on it directly.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly authRepository: AuthRepository,
    private readonly permissions: PermissionsService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  /** Set once by the gateway's `afterInit` lifecycle hook. */
  attachServer(server: Server): void {
    this.server = server;
  }

  /**
   * Authenticates a handshake from the same `access_token` HttpOnly cookie
   * REST uses (ADR 0004 §1): verify the JWT statelessly, then confirm the
   * referenced session is active, exactly as `AccessTokenGuard` does for
   * REST. Returns `null` for a missing cookie, an invalid/expired JWT, or an
   * inactive session - the gateway refuses the connection in every case.
   */
  async authenticateHandshake(
    cookieHeader: string | undefined,
  ): Promise<AuthenticatedSocket | null> {
    if (!cookieHeader) return null;

    const token = parseCookie(cookieHeader)[ACCESS_TOKEN_COOKIE];
    if (!token) return null;

    const claims = await this.accessTokens.verify(token);
    if (!claims) return null;

    if (!(await this.authRepository.isSessionActive(claims.sid))) {
      return null;
    }

    return { userId: claims.sub, sessionId: claims.sid };
  }

  /**
   * Authorizes a `workspace:<id>` room join (ADR 0004 §4). Resolves the
   * workspace's `kind`, chosen the same way `permissionsForKind()` already
   * does for the owning module, and re-checks that exact `read` permission
   * key at ORGANIZATION scope - the same boundary WSP-02 enforces for REST.
   * Always re-checked at call time; a handshake-time grant snapshot is never
   * trusted for a new join.
   */
  async authorizeWorkspaceRoom(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRoomAuthorization> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) return "not_found";

    const key = permissionsForKind(workspace.kind).read;
    const allowed = await this.permissions.hasGrant(
      userId,
      key,
      "ORGANIZATION",
    );
    return allowed ? "ok" : "denied";
  }

  /**
   * Publishes a versioned envelope to a room (ADR 0004 §2). `eventId` is
   * generated here so every frame gets one even if a producer forgets to
   * supply it; a producer that already has an internal domain event's
   * `eventId` should pass it through instead so client-side deduplication
   * lines up across the internal/public boundary (ADR 0001).
   */
  publish<TPayload>(
    room: string,
    event: string,
    version: number,
    payload: TPayload,
    eventId: string = randomUUID(),
  ): void {
    if (!this.server) {
      this.logger.warn(
        `publish("${event}") called before the gateway attached its server; dropped.`,
      );
      return;
    }
    const envelope: RealtimeEnvelope<TPayload> = {
      event,
      version,
      eventId,
      occurredAt: new Date().toISOString(),
      room,
      payload,
    };
    this.server.to(room).emit(event, envelope);
  }
}
