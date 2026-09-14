import { IsInt, Matches, Min } from "class-validator";

import type { RoomCommand } from "../realtime.contracts.js";

/**
 * Currently the only room scope a client may directly subscribe to. Case
 * sensitive and lowercase-only, deliberately: Socket.IO room names are
 * exact-string matched, and `roomName()` always produces a lowercase room.
 * A case-insensitive match here would let a client join e.g.
 * "WORKSPACE:<UUID>" and get an `ok: true` ack, while never actually
 * receiving anything published to the real (lowercase) room - a silent,
 * hard-to-diagnose delivery gap rather than a clean rejection.
 */
const WORKSPACE_ROOM_PATTERN =
  /^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `room:subscribe` / `room:unsubscribe` command payload (ADR 0004 §3-4). */
export class RoomCommandDto implements RoomCommand {
  @IsInt()
  @Min(1)
  version!: number;

  @Matches(WORKSPACE_ROOM_PATTERN, {
    message: "room must be a workspace:<uuid> room.",
  })
  room!: string;
}
