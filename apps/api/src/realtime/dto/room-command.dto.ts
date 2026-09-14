import { IsInt, Matches, Min } from "class-validator";

import type { RoomCommand } from "../realtime.contracts.js";

/** Currently the only room scope a client may directly subscribe to. */
const WORKSPACE_ROOM_PATTERN =
  /^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
