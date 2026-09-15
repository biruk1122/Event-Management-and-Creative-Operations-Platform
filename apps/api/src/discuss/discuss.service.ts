import { Injectable } from "@nestjs/common";

import {
  ConversationType,
  type PermissionScope,
  type Prisma,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { channelOwnerScope } from "./discuss.authz.js";
import type { CreateChannelDto } from "./dto/create-channel.dto.js";
import type { CreateConversationDto } from "./dto/create-conversation.dto.js";
import type { CreateMessageDto } from "./dto/create-message.dto.js";
import type { ListConversationsQueryDto } from "./dto/list-conversations-query.dto.js";
import type { ListMessagesQueryDto } from "./dto/list-messages-query.dto.js";
import type { UpdateChannelDto } from "./dto/update-channel.dto.js";
import type { UpdateMessageDto } from "./dto/update-message.dto.js";
import type { UpdateReadCursorDto } from "./dto/update-read-cursor.dto.js";
import {
  channelOwnerInvalid,
  conversationNotFound,
  conversationNotMember,
  directConversationMemberCount,
  discussDepartmentNotFound,
  discussTeamNotFound,
  discussUserNotFound,
  discussWorkspaceNotFound,
  messageNotFound,
  messageParentNotFound,
} from "./discuss.errors.js";
import type {
  ConversationRecord,
  MessageRecord,
} from "./infrastructure/discuss.repository.js";
import {
  DiscussRepository,
  type ConversationAccess,
} from "./infrastructure/discuss.repository.js";
import type {
  ConversationResponse,
  MessageResponse,
  PaginatedConversationsResponse,
  PaginatedMessagesResponse,
} from "./discuss.contracts.js";

@Injectable()
export class DiscussService {
  constructor(
    private readonly repository: DiscussRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async hasGrant(
    actingUserId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(actingUserId, permissionKey, scope);
  }

  /** `conversation.read`/`channel.participate` are baseline-only (every
   * active user holds them at SELF, for records they are a member of) plus
   * Super Admin's ORGANIZATION override - no role holds a DEPARTMENT grant
   * for either key, so there is no department tier to resolve here. */
  private async accessFor(
    actingUserId: string,
    permissionKey: string,
  ): Promise<ConversationAccess> {
    const [organization, self] = await Promise.all([
      this.hasGrant(actingUserId, permissionKey, "ORGANIZATION"),
      this.hasGrant(actingUserId, permissionKey, "SELF"),
    ]);
    if (!organization && !self) throw permissionDenied();
    return {
      organization,
      ...(self ? { selfUserId: actingUserId } : {}),
    };
  }

  private async mutationContext(
    actingUserId: string,
    conversationId: string,
    permissionKey: string,
  ): Promise<{ conversation: ConversationRecord; access: ConversationAccess }> {
    const access = await this.accessFor(actingUserId, permissionKey);
    const conversation = await this.repository.findVisibleById(
      conversationId,
      access,
    );
    if (!conversation) {
      if (access.organization) throw conversationNotFound();
      throw permissionDenied();
    }
    return { conversation, access };
  }

  private mutationUnavailable(
    access: ConversationAccess,
    result: "forbidden" | null,
  ): never {
    if (result === "forbidden" || !access.organization) {
      throw permissionDenied();
    }
    throw conversationNotFound();
  }

  /** Internal authorization boundary reused by the explicit message-file
   * surface, mirroring `TasksService.authorize`. */
  async authorize(
    actingUserId: string,
    conversationId: string,
    permissionKey: string,
  ): Promise<ConversationRecord> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      if (await this.hasGrant(actingUserId, permissionKey, "ORGANIZATION")) {
        throw conversationNotFound();
      }
      throw permissionDenied();
    }
    const member = await this.repository.isMember(conversationId, actingUserId);
    const publicChannel =
      conversation.type === ConversationType.CHANNEL &&
      conversation.visibility === "PUBLIC";
    const organization = await this.hasGrant(
      actingUserId,
      permissionKey,
      "ORGANIZATION",
    );
    if (!organization && !member && !publicChannel) {
      throw permissionDenied();
    }
    return conversation;
  }

  private async canManageChannel(
    actingUserId: string,
    conversation: Pick<
      ConversationRecord,
      "type" | "workspaceId" | "departmentId" | "teamId"
    >,
  ): Promise<boolean> {
    if (conversation.type !== ConversationType.CHANNEL) return false;
    if (await this.hasGrant(actingUserId, "channel.manage", "ORGANIZATION")) {
      return true;
    }
    const scope = channelOwnerScope(conversation);
    if (
      scope === "DEPARTMENT" &&
      (await this.hasGrant(actingUserId, "channel.manage", "DEPARTMENT"))
    ) {
      const ownDepartmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      return !!ownDepartmentId && ownDepartmentId === conversation.departmentId;
    }
    return false;
  }

  async list(
    actingUserId: string,
    query: ListConversationsQueryDto,
  ): Promise<PaginatedConversationsResponse> {
    const access = await this.accessFor(actingUserId, "conversation.read");
    const { items, total } = await this.repository.list({
      access,
      ...(query.type ? { type: query.type } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toConversationResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(
    actingUserId: string,
    conversationId: string,
  ): Promise<ConversationResponse> {
    const { conversation } = await this.mutationContext(
      actingUserId,
      conversationId,
      "conversation.read",
    );
    return toConversationResponse(conversation);
  }

  async createDirectOrGroup(
    actingUserId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationResponse> {
    const memberIds = [...new Set(dto.memberIds)].filter(
      (id) => id !== actingUserId,
    );
    if (dto.type === ConversationType.DIRECT && memberIds.length !== 1) {
      throw directConversationMemberCount();
    }
    if (!(await this.repository.usersExist(memberIds))) {
      throw discussUserNotFound();
    }
    const conversation = await this.repository.createDirectOrGroup({
      type: dto.type,
      createdById: actingUserId,
      memberIds,
    });
    return toConversationResponse(conversation);
  }

  async createChannel(
    actingUserId: string,
    dto: CreateChannelDto,
  ): Promise<ConversationResponse> {
    const ownerCount = [dto.workspaceId, dto.departmentId, dto.teamId].filter(
      (value) => value !== undefined,
    ).length;
    if (ownerCount > 1) throw channelOwnerInvalid();
    const scope = channelOwnerScope(dto);
    if (scope === "ORGANIZATION") {
      if (
        !(await this.hasGrant(actingUserId, "channel.create", "ORGANIZATION"))
      ) {
        throw permissionDenied();
      }
    } else {
      if (
        !(await this.hasGrant(actingUserId, "channel.create", "DEPARTMENT"))
      ) {
        throw permissionDenied();
      }
      const ownDepartmentId =
        await this.repository.findUserDepartmentId(actingUserId);
      if (!ownDepartmentId || ownDepartmentId !== dto.departmentId) {
        throw permissionDenied();
      }
    }
    if (
      dto.workspaceId &&
      !(await this.repository.workspaceExists(dto.workspaceId))
    ) {
      throw discussWorkspaceNotFound();
    }
    if (
      dto.departmentId &&
      !(await this.repository.departmentExists(dto.departmentId))
    ) {
      throw discussDepartmentNotFound();
    }
    if (dto.teamId && !(await this.repository.teamExists(dto.teamId))) {
      throw discussTeamNotFound();
    }
    const conversation = await this.repository.createChannel({
      createdById: actingUserId,
      name: dto.name.trim(),
      visibility: dto.visibility,
      ...(dto.workspaceId ? { workspaceId: dto.workspaceId } : {}),
      ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
      ...(dto.teamId ? { teamId: dto.teamId } : {}),
    });
    return toConversationResponse(conversation);
  }

  async updateChannel(
    actingUserId: string,
    conversationId: string,
    dto: UpdateChannelDto,
  ): Promise<ConversationResponse> {
    const { conversation, access } = await this.mutationContext(
      actingUserId,
      conversationId,
      "conversation.read",
    );
    if (!(await this.canManageChannel(actingUserId, conversation))) {
      throw permissionDenied();
    }
    const result = await this.repository.updateChannel({
      conversationId,
      access,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
    });
    if (result === "forbidden" || result === "not_found") {
      this.mutationUnavailable(access, result === "forbidden" ? result : null);
    }
    return toConversationResponse(result);
  }

  async addMember(
    actingUserId: string,
    conversationId: string,
    targetUserId: string,
  ): Promise<ConversationResponse> {
    const { conversation, access } = await this.mutationContext(
      actingUserId,
      conversationId,
      "conversation.read",
    );
    const selfJoin = actingUserId === targetUserId;
    const publicChannel =
      conversation.type === ConversationType.CHANNEL &&
      conversation.visibility === "PUBLIC";
    const allowed =
      (selfJoin && publicChannel) ||
      (await this.canManageChannel(actingUserId, conversation));
    if (!allowed) throw permissionDenied();
    const result = await this.repository.addMember({
      conversationId,
      userId: targetUserId,
      access,
    });
    if (result === "user_not_found") throw discussUserNotFound();
    if (result === "forbidden" || result === "not_found") {
      this.mutationUnavailable(access, result === "forbidden" ? result : null);
    }
    return toConversationResponse(result);
  }

  async removeMember(
    actingUserId: string,
    conversationId: string,
    targetUserId: string,
  ): Promise<ConversationResponse> {
    const { conversation, access } = await this.mutationContext(
      actingUserId,
      conversationId,
      "conversation.read",
    );
    const selfLeave = actingUserId === targetUserId;
    const allowed =
      selfLeave || (await this.canManageChannel(actingUserId, conversation));
    if (!allowed) throw permissionDenied();
    const result = await this.repository.removeMember({
      conversationId,
      userId: targetUserId,
      access,
    });
    if (result === "forbidden" || result === "not_found") {
      this.mutationUnavailable(access, result === "forbidden" ? result : null);
    }
    return toConversationResponse(result);
  }

  async updateReadCursor(
    actingUserId: string,
    conversationId: string,
    dto: UpdateReadCursorDto,
  ): Promise<void> {
    const result = await this.repository.updateReadCursor({
      conversationId,
      userId: actingUserId,
      messageId: dto.messageId,
    });
    if (result === "not_member") throw conversationNotMember();
    if (result === "message_not_found") throw messageNotFound();
  }

  async createMessage(
    actingUserId: string,
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<MessageResponse> {
    const mentionedUserIds = [...new Set(dto.mentionedUserIds ?? [])];
    const result = await this.repository.createMessage({
      conversationId,
      authorId: actingUserId,
      content: dto.content.trim(),
      ...(dto.parentMessageId ? { parentMessageId: dto.parentMessageId } : {}),
      mentionedUserIds,
    });
    if (result === "not_member") throw conversationNotMember();
    if (result === "user_not_found") throw discussUserNotFound();
    if (result === "parent_not_found") throw messageParentNotFound();
    return toMessageResponse(result);
  }

  async listMessages(
    actingUserId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<PaginatedMessagesResponse> {
    const result = await this.repository.listMessages({
      conversationId,
      userId: actingUserId,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    if (result === "not_member") throw conversationNotMember();
    return {
      items: result.items.map(toMessageResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async updateMessage(
    actingUserId: string,
    messageId: string,
    dto: UpdateMessageDto,
  ): Promise<MessageResponse> {
    const result = await this.repository.updateMessageContent({
      messageId,
      authorId: actingUserId,
      content: dto.content.trim(),
    });
    if (result === "not_found") throw messageNotFound();
    if (result === "forbidden") throw permissionDenied();
    return toMessageResponse(result);
  }

  async deleteMessage(
    actingUserId: string,
    messageId: string,
  ): Promise<MessageResponse> {
    const result = await this.repository.deleteMessage({
      messageId,
      authorId: actingUserId,
    });
    if (result === "not_found") throw messageNotFound();
    if (result === "forbidden") throw permissionDenied();
    return toMessageResponse(result);
  }

  async setPin(
    actingUserId: string,
    conversationId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<MessageResponse> {
    const result = await this.repository.setPin({
      messageId,
      conversationId,
      userId: actingUserId,
      pinned,
    });
    if (result === "not_member") throw conversationNotMember();
    if (result === "not_found") throw messageNotFound();
    return toMessageResponse(result);
  }

  /** Locks the target message (via its conversation membership) for the
   * duration of the shared upload-finalization transaction, mirroring
   * `TasksService.lockAttachmentFinalization`. */
  async lockAttachmentFinalization(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; conversationId: string; messageId: string },
  ): Promise<void> {
    const access = await this.repository.lockMessageAttachmentAccess(tx, {
      conversationId: input.conversationId,
      messageId: input.messageId,
      userId: input.actingUserId,
    });
    if (access === "not_found") throw messageNotFound();
    if (access === "forbidden") throw permissionDenied();
  }

  /** Persists only the message-owned association, mirroring
   * `TasksService.recordAttachment`. */
  async recordAttachment(
    tx: Prisma.TransactionClient,
    input: { actingUserId: string; messageId: string; fileId: string },
  ): Promise<void> {
    await this.repository.createMessageAttachment(tx, {
      messageId: input.messageId,
      fileId: input.fileId,
      attachedById: input.actingUserId,
    });
  }

  async listAttachmentFileIds(
    actingUserId: string,
    conversationId: string,
    messageId: string,
    pageNumber: number,
    pageSize: number,
  ): Promise<{ fileIds: string[]; total: number }> {
    await this.authorize(actingUserId, conversationId, "conversation.read");
    return this.repository.messageAttachmentFileIds(
      messageId,
      pageNumber,
      pageSize,
    );
  }

  async readAttachmentContext(
    actingUserId: string,
    conversationId: string,
    messageId: string,
    fileId: string,
  ): Promise<{ workspaceId: string | null } | null> {
    const conversation = await this.authorize(
      actingUserId,
      conversationId,
      "conversation.read",
    );
    return (await this.repository.hasMessageAttachment(messageId, fileId))
      ? { workspaceId: conversation.workspaceId }
      : null;
  }
}

function toConversationResponse(
  record: ConversationRecord,
): ConversationResponse {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    visibility: record.visibility,
    workspaceId: record.workspaceId,
    departmentId: record.departmentId,
    teamId: record.teamId,
    createdBy: record.createdBy,
    members: record.members.map((member) => ({
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      joinedAt: member.joinedAt.toISOString(),
      lastReadMessageId: member.lastReadMessageId,
      lastReadAt: member.lastReadAt?.toISOString() ?? null,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toMessageResponse(record: MessageRecord): MessageResponse {
  return {
    id: record.id,
    conversationId: record.conversationId,
    author: record.author,
    parentMessageId: record.parentMessageId,
    content: record.content,
    mentionedUsers: record.mentionedUsers,
    editedAt: record.editedAt?.toISOString() ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    pinnedAt: record.pinnedAt?.toISOString() ?? null,
    pinnedBy: record.pinnedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
