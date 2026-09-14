import { Injectable } from "@nestjs/common";
import type { Socket } from "socket.io";

/**
 * Tracks connected sockets by session id, in-process only (ADR 0004 §7: no
 * Redis, single API replica). This is what lets a future caller disconnect
 * every live connection for a session that was just revoked - see ADR 0004
 * §4.5.2, "best-effort, not durable: a socket that misses the disconnect
 * signal still loses access on its next REST call or reconnect." Wiring the
 * auth module's session-revocation path to call `disconnectSession` is a
 * cross-module follow-up, not part of this bounded module (RTC-02).
 */
@Injectable()
export class SessionRegistryService {
  private readonly sockets = new Map<string, Set<Socket>>();

  register(sessionId: string, socket: Socket): void {
    const existing = this.sockets.get(sessionId);
    if (existing) {
      existing.add(socket);
      return;
    }
    this.sockets.set(sessionId, new Set([socket]));
  }

  unregister(sessionId: string, socket: Socket): void {
    const existing = this.sockets.get(sessionId);
    if (!existing) return;
    existing.delete(socket);
    if (existing.size === 0) {
      this.sockets.delete(sessionId);
    }
  }

  /** Disconnects every live socket for a session. Best-effort; see above. */
  disconnectSession(sessionId: string): void {
    const existing = this.sockets.get(sessionId);
    if (!existing) return;
    for (const socket of existing) {
      socket.disconnect(true);
    }
    this.sockets.delete(sessionId);
  }

  /** For tests: how many sockets are currently registered for a session. */
  countForSession(sessionId: string): number {
    return this.sockets.get(sessionId)?.size ?? 0;
  }
}
