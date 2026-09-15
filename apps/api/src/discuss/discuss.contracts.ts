import { ApiProperty } from "@nestjs/swagger";

import {
  ChannelVisibility,
  ConversationType,
} from "../generated/prisma/client.js";

export class DiscussPersonSummary {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;
}

export class ConversationMemberResponse extends DiscussPersonSummary {
  @ApiProperty({ format: "date-time" })
  joinedAt!: string;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  lastReadMessageId!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  lastReadAt!: string | null;
}

export class ConversationResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ConversationType })
  type!: ConversationType;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ChannelVisibility, nullable: true })
  visibility!: ChannelVisibility | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  workspaceId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  departmentId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  teamId!: string | null;

  @ApiProperty({ type: DiscussPersonSummary, nullable: true })
  createdBy!: DiscussPersonSummary | null;

  @ApiProperty({ type: [ConversationMemberResponse] })
  members!: ConversationMemberResponse[];

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedConversationsResponse {
  @ApiProperty({ type: [ConversationResponse] })
  items!: ConversationResponse[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class MessageResponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  conversationId!: string;

  @ApiProperty({ type: DiscussPersonSummary, nullable: true })
  author!: DiscussPersonSummary | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  parentMessageId!: string | null;

  @ApiProperty({
    example: "The venue is confirmed for Saturday.",
    description: "Empty once the message has been deleted.",
  })
  content!: string;

  @ApiProperty({ type: [DiscussPersonSummary] })
  mentionedUsers!: DiscussPersonSummary[];

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  editedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  pinnedAt!: string | null;

  @ApiProperty({ type: DiscussPersonSummary, nullable: true })
  pinnedBy!: DiscussPersonSummary | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

export class PaginatedMessagesResponse {
  @ApiProperty({ type: [MessageResponse] })
  items!: MessageResponse[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
