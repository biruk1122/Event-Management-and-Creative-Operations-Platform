import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from "@nestjs/websockets";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { Server, Socket } from "socket.io";

import { environment, parseCorsOrigins } from "../config/environment.js";
import { RoomCommandDto } from "./dto/room-command.dto.js";
import { roomName, type RealtimeAck } from "./realtime.contracts.js";
import {
  notFoundAck,
  permissionDeniedAck,
  rateLimitedAck,
  validationErrorAck,
} from "./realtime.errors.js";
import { RealtimeRateLimiter } from "./realtime.rate-limiter.js";
import { RealtimeService } from "./realtime.service.js";
import { SessionRegistryService } from "./infrastructure/session-registry.service.js";

interface SocketData {
  userId: string;
  sessionId: string;
}

/**
 * The `/realtime` Socket.IO gateway (ADR 0004). Owns the transport lifecycle
 * only: handshake authentication happens in a connection middleware, so an
 * unauthenticated client's handshake is refused before `connection` fires
 * (ADR 0004 §1); every other decision is delegated to `RealtimeService`.
 *
 * Command validation is deliberately manual (`class-validator`'s `validate()`
 * called directly) rather than `@UsePipes(ValidationPipe)`: the global pipe
 * throws, and NestJS's default WS exception handling emits an unsolicited
 * `exception` frame rather than the caller's own acknowledgement - which
 * would violate ADR 0004 §3's "the server always acks; it never leaves a
 * command unacknowledged."
 *
 * `maxHttpBufferSize` bounds every inbound frame to 16 KiB (ADR 0004 §7); the
 * engine rejects and disconnects a client that exceeds it, so no per-command
 * size check is needed on top.
 */
@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    credentials: true,
    origin: parseCorsOrigins(environment.CORS_ORIGINS),
  },
  maxHttpBufferSize: 16 * 1024,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly sessions: SessionRegistryService,
    private readonly rateLimiter: RealtimeRateLimiter,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attachServer(server);

    // Authenticate during the handshake itself so an unauthenticated client
    // never reaches `connection` (ADR 0004 §1: "refuses the handshake before
    // a connection is established").
    server.use((socket, next) => {
      void this.realtime
        .authenticateHandshake(socket.handshake.headers.cookie)
        .then((authenticated) => {
          if (!authenticated) {
            next(new Error("unauthenticated"));
            return;
          }
          (socket.data as SocketData) = authenticated;
          next();
        })
        .catch(() => next(new Error("unauthenticated")));
    });
  }

  handleConnection(socket: Socket): void {
    const { userId, sessionId } = socket.data as SocketData;
    this.sessions.register(sessionId, socket);
    // Every socket auto-joins exactly its own user room; no authorization
    // call is needed beyond "this is the authenticated identity itself"
    // (ADR 0004 §4).
    void socket.join(roomName("user", userId));
  }

  handleDisconnect(socket: Socket): void {
    const data = socket.data as Partial<SocketData>;
    if (data.sessionId) {
      this.sessions.unregister(data.sessionId, socket);
    }
  }

  @SubscribeMessage("room:subscribe")
  async handleSubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() socket: Socket,
  ): Promise<RealtimeAck> {
    const command = await this.validateRoomCommand(body);
    if (!(command instanceof RoomCommandDto)) return command;
    return this.handleRoomCommand(command, socket, "subscribe");
  }

  @SubscribeMessage("room:unsubscribe")
  async handleUnsubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() socket: Socket,
  ): Promise<RealtimeAck> {
    const command = await this.validateRoomCommand(body);
    if (!(command instanceof RoomCommandDto)) return command;
    return this.handleRoomCommand(command, socket, "unsubscribe");
  }

  private async validateRoomCommand(
    body: unknown,
  ): Promise<RoomCommandDto | RealtimeAck> {
    const instance = plainToInstance(
      RoomCommandDto,
      typeof body === "object" && body !== null ? body : {},
    );
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length === 0) return instance;
    const message = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join(" ");
    return {
      ok: false,
      error: validationErrorAck(message || "Invalid command."),
    };
  }

  private async handleRoomCommand(
    command: RoomCommandDto,
    socket: Socket,
    action: "subscribe" | "unsubscribe",
  ): Promise<RealtimeAck> {
    const { userId, sessionId } = socket.data as SocketData;

    if (!this.rateLimiter.consume(sessionId)) {
      return { ok: false, error: rateLimitedAck() };
    }

    if (action === "unsubscribe") {
      void socket.leave(command.room);
      return { ok: true, data: { room: command.room } };
    }

    const workspaceId = command.room.slice("workspace:".length);
    const outcome = await this.realtime.authorizeWorkspaceRoom(
      userId,
      workspaceId,
    );
    if (outcome === "not_found") {
      return {
        ok: false,
        error: notFoundAck("No workspace exists with that id."),
      };
    }
    if (outcome === "denied") {
      return { ok: false, error: permissionDeniedAck() };
    }

    void socket.join(command.room);
    return { ok: true, data: { room: command.room } };
  }
}
