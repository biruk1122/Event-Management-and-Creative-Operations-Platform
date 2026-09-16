import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { NotificationType } from "../generated/prisma/client.js";

export class NotificationResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ example: "You were assigned a task" })
  title!: string;

  @ApiProperty({ example: "Confirm the venue booking" })
  body!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  taskId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  messageId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  eventId!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  readAt!: string | null;
}

export class NotificationFeedResponse {
  @ApiProperty({ type: [NotificationResponse] })
  items!: NotificationResponse[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Opaque cursor for the next page; null when there is no more.",
  })
  nextCursor!: string | null;
}

export class UnreadCountResponse {
  @ApiProperty({ minimum: 0 })
  unreadCount!: number;
}

export class NotificationPreferenceResponse {
  @ApiProperty({
    enum: NotificationType,
    description: "Always one of the mutable types (ADR 0003 §4).",
  })
  type!: NotificationType;

  @ApiProperty()
  muted!: boolean;
}

export class NotificationPreferencesResponse {
  @ApiProperty({ type: [NotificationPreferenceResponse] })
  items!: NotificationPreferenceResponse[];
}

/**
 * The advisory real-time frame published on `user:<recipientId>` after a
 * notification is created (ADR 0003 §5; ADR 0004 §2). The client only ever
 * treats this as a signal to refetch the REST feed - never as the record
 * itself.
 */
export interface NotificationInvalidatedPayload {
  notificationId: string;
  type: NotificationType;
}
