import type { ChannelVisibility, Conversation, Message } from "./discuss-types";

export interface StartConversationValues {
  type: "DIRECT" | "GROUP";
  memberIds: string[];
}

/** Mirrors `POST /api/v1/conversations`'s stable Problem Details codes. */
export type StartConversationOutcome =
  | { status: "success"; conversation: Conversation }
  | { status: "direct_member_count" }
  | { status: "user_not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<"memberIds", string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type StartConversation = (
  values: StartConversationValues,
) => Promise<StartConversationOutcome>;

export interface CreateChannelValues {
  name: string;
  visibility: ChannelVisibility;
  workspaceId: string | null;
  departmentId: string | null;
  teamId: string | null;
}

/** Mirrors `POST /api/v1/conversations/channels`. */
export type CreateChannelOutcome =
  | { status: "success"; conversation: Conversation }
  | { status: "owner_invalid" }
  | { status: "workspace_not_found" }
  | { status: "department_not_found" }
  | { status: "team_not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateChannelValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateChannel = (
  values: CreateChannelValues,
) => Promise<CreateChannelOutcome>;

/** Mirrors `PATCH /api/v1/conversations/:id`. */
export type UpdateChannelOutcome =
  | { status: "success"; conversation: Conversation }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateChannel = (
  conversationId: string,
  values: { name?: string; visibility?: ChannelVisibility },
) => Promise<UpdateChannelOutcome>;

/** `UpdateChannel` curried to one conversation. */
export type ScopedUpdateChannel = (values: {
  name?: string;
  visibility?: ChannelVisibility;
}) => Promise<UpdateChannelOutcome>;

/** Mirrors `PUT/DELETE /api/v1/conversations/:id/members/:userId`. */
export type MembershipOutcome =
  | { status: "success"; conversation: Conversation }
  | { status: "user_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AddMember = (
  conversationId: string,
  userId: string,
) => Promise<MembershipOutcome>;

export type RemoveMember = (
  conversationId: string,
  userId: string,
) => Promise<MembershipOutcome>;

export interface SendMessageValues {
  content: string;
  parentMessageId: string | null;
  mentionedUserIds: string[];
}

/** Mirrors `POST /api/v1/conversations/:id/messages`. */
export type SendMessageOutcome =
  | { status: "success"; message: Message }
  | { status: "not_member" }
  | { status: "user_not_found" }
  | { status: "parent_not_found" }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof SendMessageValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type SendMessage = (
  conversationId: string,
  values: SendMessageValues,
) => Promise<SendMessageOutcome>;

/** `SendMessage` curried to one conversation, for a composer that already
 * knows which conversation it is posting into. */
export type ScopedSendMessage = (
  values: SendMessageValues,
) => Promise<SendMessageOutcome>;

/** Mirrors `PATCH /api/v1/conversations/:id/messages/:messageId`. */
export type EditMessageOutcome =
  | { status: "success"; message: Message }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type EditMessage = (
  conversationId: string,
  messageId: string,
  content: string,
) => Promise<EditMessageOutcome>;

/** `EditMessage` curried to one conversation. */
export type ScopedEditMessage = (
  messageId: string,
  content: string,
) => Promise<EditMessageOutcome>;

/** Mirrors `DELETE /api/v1/conversations/:id/messages/:messageId`. */
export type DeleteMessageOutcome =
  | { status: "success"; message: Message }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteMessage = (
  conversationId: string,
  messageId: string,
) => Promise<DeleteMessageOutcome>;

/** `DeleteMessage` curried to one conversation. */
export type ScopedDeleteMessage = (
  messageId: string,
) => Promise<DeleteMessageOutcome>;

/** Mirrors `PUT/DELETE /api/v1/conversations/:id/messages/:messageId/pin`. */
export type PinOutcome =
  | { status: "success"; message: Message }
  | { status: "not_member" }
  | { status: "not_found" }
  | { status: "unexpected" };

export type SetPin = (
  conversationId: string,
  messageId: string,
  pinned: boolean,
) => Promise<PinOutcome>;

/** `SetPin` curried to one conversation. */
export type ScopedSetPin = (
  messageId: string,
  pinned: boolean,
) => Promise<PinOutcome>;

/** Mirrors `PUT /api/v1/conversations/:id/read-cursor`. */
export type ReadCursorOutcome =
  | { status: "success" }
  | { status: "not_member" }
  | { status: "not_found" }
  | { status: "unexpected" };

export type UpdateReadCursor = (
  conversationId: string,
  messageId: string,
) => Promise<ReadCursorOutcome>;
