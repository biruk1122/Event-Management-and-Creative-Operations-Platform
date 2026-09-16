import { Injectable } from "@nestjs/common";

import {
  ChannelVisibility,
  ConversationType,
  OutboxActorKind,
  Prisma,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface PersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ConversationMemberRecord extends PersonRecord {
  joinedAt: Date;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
}

export interface ConversationRecord {
  id: string;
  type: ConversationType;
  name: string | null;
  visibility: ChannelVisibility | null;
  workspaceId: string | null;
  departmentId: string | null;
  teamId: string | null;
  createdBy: PersonRecord | null;
  members: ConversationMemberRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  author: PersonRecord | null;
  parentMessageId: string | null;
  content: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  pinnedAt: Date | null;
  pinnedBy: PersonRecord | null;
  mentionedUsers: PersonRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Read access for the two baseline-only keys (`conversation.read`,
 * `channel.participate`): every active user holds them at `SELF` for
 * conversations/channels they are a member of; only Super Admin holds the
 * `ORGANIZATION` override (see the seeded RBAC catalog - no role holds a
 * `DEPARTMENT` grant for either key). A public channel is additionally
 * visible to everyone regardless of membership, mirroring the product
 * vocabulary's "discoverable and joinable" definition.
 */
export interface ConversationAccess {
  organization: boolean;
  selfUserId?: string;
}

type MutationAccess = "visible" | "forbidden" | "not_found";

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const MEMBER_SELECT = {
  userId: true,
  joinedAt: true,
  lastReadMessageId: true,
  lastReadAt: true,
  user: { select: PERSON_SELECT },
} as const;

const CONVERSATION_SELECT = {
  id: true,
  type: true,
  name: true,
  visibility: true,
  workspaceId: true,
  departmentId: true,
  teamId: true,
  createdBy: { select: PERSON_SELECT },
  members: { select: MEMBER_SELECT },
  createdAt: true,
  updatedAt: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  author: { select: PERSON_SELECT },
  parentMessageId: true,
  content: true,
  editedAt: true,
  deletedAt: true,
  pinnedAt: true,
  pinnedBy: { select: PERSON_SELECT },
  mentions: { select: { user: { select: PERSON_SELECT } } },
  createdAt: true,
  updatedAt: true,
} as const;

type RawConversation = Prisma.ConversationGetPayload<{
  select: typeof CONVERSATION_SELECT;
}>;
type RawMessage = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function byPerson(a: PersonRecord, b: PersonRecord): number {
  return (
    (a.lastName ?? a.email).localeCompare(b.lastName ?? b.email) ||
    a.email.localeCompare(b.email)
  );
}

function toConversationRecord(raw: RawConversation): ConversationRecord {
  return {
    id: raw.id,
    type: raw.type,
    name: raw.name,
    visibility: raw.visibility,
    workspaceId: raw.workspaceId,
    departmentId: raw.departmentId,
    teamId: raw.teamId,
    createdBy: raw.createdBy,
    members: raw.members
      .map((member) => ({
        ...member.user,
        joinedAt: member.joinedAt,
        lastReadMessageId: member.lastReadMessageId,
        lastReadAt: member.lastReadAt,
      }))
      .sort(byPerson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toMessageRecord(raw: RawMessage): MessageRecord {
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    author: raw.author,
    parentMessageId: raw.parentMessageId,
    content: raw.content,
    editedAt: raw.editedAt,
    deletedAt: raw.deletedAt,
    pinnedAt: raw.pinnedAt,
    pinnedBy: raw.pinnedBy,
    mentionedUsers: raw.mentions.map((mention) => mention.user).sort(byPerson),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** A caller sees a conversation if it holds the org override, is an explicit
 * member, or the conversation is a public channel. */
function visibleWhere(
  access: ConversationAccess,
): Prisma.ConversationWhereInput {
  if (access.organization) return {};
  const alternatives: Prisma.ConversationWhereInput[] = [
    { type: ConversationType.CHANNEL, visibility: ChannelVisibility.PUBLIC },
  ];
  if (access.selfUserId) {
    alternatives.push({ members: { some: { userId: access.selfUserId } } });
  }
  return { OR: alternatives };
}

@Injectable()
export class DiscussRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async workspaceExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.workspace.count({ where: { id } })) === 1;
  }

  async departmentExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.department.count({ where: { id } })) === 1;
  }

  async teamExists(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (await this.db.team.count({ where: { id } })) === 1;
  }

  async usersExist(ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const count = await this.db.user.count({ where: { id: { in: [...ids] } } });
    return count === ids.length;
  }

  async createDirectOrGroup(input: {
    type: typeof ConversationType.DIRECT | typeof ConversationType.GROUP;
    createdById: string;
    memberIds: readonly string[];
  }): Promise<ConversationRecord> {
    const memberIds = [...new Set([input.createdById, ...input.memberIds])];
    const conversation = await this.db.conversation.create({
      data: {
        type: input.type,
        createdById: input.createdById,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      select: CONVERSATION_SELECT,
    });
    return toConversationRecord(conversation);
  }

  async createChannel(input: {
    createdById: string;
    name: string;
    visibility: ChannelVisibility;
    workspaceId?: string;
    departmentId?: string;
    teamId?: string;
  }): Promise<ConversationRecord> {
    const conversation = await this.db.conversation.create({
      data: {
        type: ConversationType.CHANNEL,
        name: input.name,
        visibility: input.visibility,
        createdById: input.createdById,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        ...(input.teamId ? { teamId: input.teamId } : {}),
        members: { create: [{ userId: input.createdById }] },
      },
      select: CONVERSATION_SELECT,
    });
    return toConversationRecord(conversation);
  }

  async list(input: {
    access: ConversationAccess;
    type?: ConversationType;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: ConversationRecord[]; total: number }> {
    const where: Prisma.ConversationWhereInput = {
      AND: [visibleWhere(input.access)],
      ...(input.type ? { type: input.type } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.conversation.findMany({
        where,
        select: CONVERSATION_SELECT,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.conversation.count({ where }),
    ]);
    return { items: items.map(toConversationRecord), total };
  }

  async findById(id: string): Promise<ConversationRecord | null> {
    if (!isUuid(id)) return null;
    const conversation = await this.db.conversation.findUnique({
      where: { id },
      select: CONVERSATION_SELECT,
    });
    return conversation ? toConversationRecord(conversation) : null;
  }

  async findVisibleById(
    id: string,
    access: ConversationAccess,
  ): Promise<ConversationRecord | null> {
    if (!isUuid(id)) return null;
    const conversation = await this.db.conversation.findFirst({
      where: { AND: [{ id }, visibleWhere(access)] },
      select: CONVERSATION_SELECT,
    });
    return conversation ? toConversationRecord(conversation) : null;
  }

  private async lockMutationAccess(
    tx: Prisma.TransactionClient,
    conversationId: string,
    access: ConversationAccess,
  ): Promise<MutationAccess> {
    if (!isUuid(conversationId)) return "not_found";
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`,
    );
    if (locked.length !== 1) return "not_found";
    const visible = await tx.conversation.count({
      where: { AND: [{ id: conversationId }, visibleWhere(access)] },
    });
    return visible === 1 ? "visible" : "forbidden";
  }

  async isMember(conversationId: string, userId: string): Promise<boolean> {
    if (!isUuid(conversationId) || !isUuid(userId)) return false;
    const count = await this.db.conversationMember.count({
      where: { conversationId, userId },
    });
    return count === 1;
  }

  async addMember(input: {
    conversationId: string;
    userId: string;
    access: ConversationAccess;
  }): Promise<
    ConversationRecord | "forbidden" | "not_found" | "user_not_found"
  > {
    return this.db.$transaction(async (tx) => {
      const mutationAccess = await this.lockMutationAccess(
        tx,
        input.conversationId,
        input.access,
      );
      if (mutationAccess !== "visible") return mutationAccess;
      const userCount = await tx.user.count({ where: { id: input.userId } });
      if (userCount !== 1) return "user_not_found";
      await tx.conversationMember.upsert({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.userId,
          },
        },
        create: { conversationId: input.conversationId, userId: input.userId },
        update: {},
      });
      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { id: input.conversationId },
        select: CONVERSATION_SELECT,
      });
      return toConversationRecord(conversation);
    });
  }

  async removeMember(input: {
    conversationId: string;
    userId: string;
    access: ConversationAccess;
  }): Promise<ConversationRecord | "forbidden" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      const mutationAccess = await this.lockMutationAccess(
        tx,
        input.conversationId,
        input.access,
      );
      if (mutationAccess !== "visible") return mutationAccess;
      await tx.conversationMember.deleteMany({
        where: { conversationId: input.conversationId, userId: input.userId },
      });
      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { id: input.conversationId },
        select: CONVERSATION_SELECT,
      });
      return toConversationRecord(conversation);
    });
  }

  async updateChannel(input: {
    conversationId: string;
    access: ConversationAccess;
    name?: string;
    visibility?: ChannelVisibility;
  }): Promise<ConversationRecord | "forbidden" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      const mutationAccess = await this.lockMutationAccess(
        tx,
        input.conversationId,
        input.access,
      );
      if (mutationAccess !== "visible") return mutationAccess;
      const conversation = await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.visibility !== undefined
            ? { visibility: input.visibility }
            : {}),
        },
        select: CONVERSATION_SELECT,
      });
      return toConversationRecord(conversation);
    });
  }

  async updateReadCursor(input: {
    conversationId: string;
    userId: string;
    messageId: string;
  }): Promise<"ok" | "not_member" | "message_not_found"> {
    if (!isUuid(input.messageId)) return "message_not_found";
    return this.db.$transaction(async (tx) => {
      const member = await tx.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.userId,
          },
        },
        select: { conversationId: true },
      });
      if (!member) return "not_member";
      const message = await tx.message.findFirst({
        where: { id: input.messageId, conversationId: input.conversationId },
        select: { id: true },
      });
      if (!message) return "message_not_found";
      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.userId,
          },
        },
        data: { lastReadMessageId: input.messageId, lastReadAt: new Date() },
      });
      return "ok";
    });
  }

  async createMessage(input: {
    conversationId: string;
    authorId: string;
    content: string;
    parentMessageId?: string;
    mentionedUserIds: readonly string[];
  }): Promise<
    MessageRecord | "not_member" | "user_not_found" | "parent_not_found"
  > {
    return this.db.$transaction(async (tx) => {
      const member = await tx.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.authorId,
          },
        },
        select: { conversationId: true },
      });
      if (!member) return "not_member";
      if (input.parentMessageId) {
        const parent = await tx.message.findFirst({
          where: {
            id: input.parentMessageId,
            conversationId: input.conversationId,
          },
          select: { id: true },
        });
        if (!parent) return "parent_not_found";
      }
      if (input.mentionedUserIds.length) {
        const count = await tx.user.count({
          where: { id: { in: [...input.mentionedUserIds] } },
        });
        if (count !== input.mentionedUserIds.length) return "user_not_found";
      }
      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          authorId: input.authorId,
          content: input.content,
          ...(input.parentMessageId
            ? { parentMessageId: input.parentMessageId }
            : {}),
          mentions: {
            create: input.mentionedUserIds.map((userId) => ({ userId })),
          },
        },
        select: MESSAGE_SELECT,
      });
      await this.outbox.append(tx, {
        name: "discuss.message.created",
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: input.authorId,
        resourceType: "message",
        resourceId: message.id,
        payload: { conversationId: input.conversationId },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
      return toMessageRecord(message);
    });
  }

  async listMessages(input: {
    conversationId: string;
    userId: string;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: MessageRecord[]; total: number } | "not_member"> {
    const isMember = await this.isMember(input.conversationId, input.userId);
    if (!isMember) return "not_member";
    const where: Prisma.MessageWhereInput = {
      conversationId: input.conversationId,
      ...(input.search
        ? { content: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.message.findMany({
        where,
        select: MESSAGE_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.message.count({ where }),
    ]);
    return { items: items.map(toMessageRecord), total };
  }

  /** Locks the message row and confirms it both belongs to the given
   * conversation and is authored by the caller, so a URL naming the wrong
   * conversation for a real message id cannot be used to mutate it. */
  private async lockMessageMutationAccess(
    tx: Prisma.TransactionClient,
    conversationId: string,
    messageId: string,
    authorId: string,
  ): Promise<
    { id: string; conversationId: string } | "forbidden" | "not_found"
  > {
    if (!isUuid(conversationId) || !isUuid(messageId)) return "not_found";
    const locked = await tx.$queryRaw<
      Array<{ id: string; conversation_id: string; author_id: string | null }>
    >(
      Prisma.sql`SELECT id, conversation_id, author_id FROM messages WHERE id = ${messageId}::uuid FOR UPDATE`,
    );
    const row = locked[0];
    if (!row || row.conversation_id !== conversationId) return "not_found";
    if (row.author_id !== authorId) return "forbidden";
    return { id: row.id, conversationId: row.conversation_id };
  }

  async updateMessageContent(input: {
    conversationId: string;
    messageId: string;
    authorId: string;
    content: string;
  }): Promise<MessageRecord | "forbidden" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMessageMutationAccess(
        tx,
        input.conversationId,
        input.messageId,
        input.authorId,
      );
      if (access === "forbidden" || access === "not_found") return access;
      const message = await tx.message.update({
        where: { id: input.messageId },
        data: { content: input.content, editedAt: new Date() },
        select: MESSAGE_SELECT,
      });
      return toMessageRecord(message);
    });
  }

  async deleteMessage(input: {
    conversationId: string;
    messageId: string;
    authorId: string;
  }): Promise<MessageRecord | "forbidden" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      const access = await this.lockMessageMutationAccess(
        tx,
        input.conversationId,
        input.messageId,
        input.authorId,
      );
      if (access === "forbidden" || access === "not_found") return access;
      const message = await tx.message.update({
        where: { id: input.messageId },
        data: { deletedAt: new Date(), content: "" },
        select: MESSAGE_SELECT,
      });
      return toMessageRecord(message);
    });
  }

  async setPin(input: {
    messageId: string;
    conversationId: string;
    userId: string;
    pinned: boolean;
  }): Promise<MessageRecord | "not_member" | "not_found"> {
    return this.db.$transaction(async (tx) => {
      const member = await tx.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.userId,
          },
        },
        select: { conversationId: true },
      });
      if (!member) return "not_member";
      const existing = await tx.message.findFirst({
        where: { id: input.messageId, conversationId: input.conversationId },
        select: { id: true },
      });
      if (!existing) return "not_found";
      const message = await tx.message.update({
        where: { id: input.messageId },
        data: input.pinned
          ? { pinnedAt: new Date(), pinnedById: input.userId }
          : { pinnedAt: null, pinnedById: null },
        select: MESSAGE_SELECT,
      });
      return toMessageRecord(message);
    });
  }

  /** Locks the message row (via its parent conversation membership) for the
   * duration of an attachment-finalization transaction, mirroring
   * `TasksRepository.lockAttachmentAccess`. Membership, not a permission
   * grant, is the gate: every member may attach a file to a message in a
   * conversation they belong to. */
  async lockMessageAttachmentAccess(
    tx: Prisma.TransactionClient,
    input: { conversationId: string; messageId: string; userId: string },
  ): Promise<"visible" | "forbidden" | "not_found"> {
    if (!isUuid(input.conversationId) || !isUuid(input.messageId)) {
      return "not_found";
    }
    const message = await tx.message.findFirst({
      where: { id: input.messageId, conversationId: input.conversationId },
      select: { id: true },
    });
    if (!message) return "not_found";
    const member = await tx.conversationMember.count({
      where: { conversationId: input.conversationId, userId: input.userId },
    });
    return member === 1 ? "visible" : "forbidden";
  }

  async createMessageAttachment(
    tx: Prisma.TransactionClient,
    input: { messageId: string; fileId: string; attachedById: string },
  ): Promise<void> {
    await tx.messageAttachment.create({
      data: {
        messageId: input.messageId,
        managedFileId: input.fileId,
        attachedById: input.attachedById,
      },
    });
  }

  async messageAttachmentFileIds(
    messageId: string,
    page: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    if (!isUuid(messageId)) return { fileIds: [], total: 0 };
    const where: Prisma.MessageAttachmentWhereInput = { messageId };
    const [attachments, total] = await Promise.all([
      this.db.messageAttachment.findMany({
        where,
        select: { managedFileId: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.messageAttachment.count({ where }),
    ]);
    return { fileIds: attachments.map((a) => a.managedFileId), total };
  }

  async hasMessageAttachment(
    messageId: string,
    fileId: string,
  ): Promise<boolean> {
    if (!isUuid(messageId) || !isUuid(fileId)) return false;
    const count = await this.db.messageAttachment.count({
      where: { messageId, managedFileId: fileId },
    });
    return count === 1;
  }
}
