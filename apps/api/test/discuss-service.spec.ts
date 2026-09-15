import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChannelVisibility,
  ConversationType,
  type PermissionScope,
} from "../src/generated/prisma/client.js";
import { DiscussService } from "../src/discuss/discuss.service.js";
import type {
  ConversationRecord,
  MessageRecord,
} from "../src/discuss/infrastructure/discuss.repository.js";

const ACTOR = "actor-1";

function makeConversation(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id: "conversation-1",
    type: ConversationType.GROUP,
    name: null,
    visibility: null,
    workspaceId: null,
    departmentId: null,
    teamId: null,
    createdBy: null,
    members: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    author: null,
    parentMessageId: null,
    content: "hello",
    editedAt: null,
    deletedAt: null,
    pinnedAt: null,
    pinnedBy: null,
    mentionedUsers: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect(
      ((error as HttpException).getResponse() as { code: string }).code,
    ).toBe(code);
  });
}

describe("DiscussService", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (
          userId: string,
          key: string,
          scope: PermissionScope,
        ) => Promise<boolean>
      >
    >;
  };
  let service: DiscussService;

  beforeEach(() => {
    repository = {
      findUserDepartmentId: vi.fn().mockResolvedValue("department-1"),
      workspaceExists: vi.fn().mockResolvedValue(true),
      departmentExists: vi.fn().mockResolvedValue(true),
      teamExists: vi.fn().mockResolvedValue(true),
      usersExist: vi.fn().mockResolvedValue(true),
      createDirectOrGroup: vi.fn().mockResolvedValue(makeConversation()),
      createChannel: vi.fn().mockResolvedValue(makeConversation()),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeConversation()),
      findVisibleById: vi.fn().mockResolvedValue(makeConversation()),
      isMember: vi.fn().mockResolvedValue(true),
      addMember: vi.fn().mockResolvedValue(makeConversation()),
      removeMember: vi.fn().mockResolvedValue(makeConversation()),
      updateChannel: vi.fn().mockResolvedValue(makeConversation()),
      updateReadCursor: vi.fn().mockResolvedValue("ok"),
      createMessage: vi.fn().mockResolvedValue(makeMessage()),
      listMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      updateMessageContent: vi.fn().mockResolvedValue(makeMessage()),
      deleteMessage: vi
        .fn()
        .mockResolvedValue(makeMessage({ content: "", deletedAt: new Date() })),
      setPin: vi.fn().mockResolvedValue(makeMessage({ pinnedAt: new Date() })),
      lockMessageAttachmentAccess: vi.fn().mockResolvedValue("visible"),
      createMessageAttachment: vi.fn().mockResolvedValue(undefined),
      messageAttachmentFileIds: vi
        .fn()
        .mockResolvedValue({ fileIds: [], total: 0 }),
      hasMessageAttachment: vi.fn().mockResolvedValue(true),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(false) };
    service = new DiscussService(repository as never, permissions as never);
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  it("builds a self-scoped list query without trusting a client owner", async () => {
    grantOnly(["conversation.read", "SELF"]);
    await service.list(ACTOR, { page: 1, pageSize: 25 });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        access: { organization: false, selfUserId: ACTOR },
      }),
    );
  });

  it("does not reveal whether a conversation id exists to a narrow-scoped caller", async () => {
    grantOnly(["conversation.read", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(null);
    await expectCode(service.get(ACTOR, "missing"), "PERMISSION_DENIED");

    grantOnly(["conversation.read", "ORGANIZATION"]);
    await expectCode(service.get(ACTOR, "missing"), "CONVERSATION_NOT_FOUND");
  });

  it("resolves authorize() the same way, plus a public-channel bypass that needs no membership", async () => {
    repository.findById!.mockResolvedValue(null);
    await expectCode(
      service.authorize(ACTOR, "missing", "message.send"),
      "PERMISSION_DENIED",
    );
    grantOnly(["message.send", "ORGANIZATION"]);
    await expectCode(
      service.authorize(ACTOR, "missing", "message.send"),
      "CONVERSATION_NOT_FOUND",
    );

    permissions.hasGrant.mockResolvedValue(false);
    repository.findById!.mockResolvedValue(makeConversation());
    repository.isMember!.mockResolvedValue(false);
    await expectCode(
      service.authorize(ACTOR, "conversation-1", "message.send"),
      "PERMISSION_DENIED",
    );

    repository.findById!.mockResolvedValue(
      makeConversation({
        type: ConversationType.CHANNEL,
        visibility: ChannelVisibility.PUBLIC,
      }),
    );
    await expect(
      service.authorize(ACTOR, "conversation-1", "message.send"),
    ).resolves.toMatchObject({ type: ConversationType.CHANNEL });
  });

  it("resolves channel management scope from the channel's owner, matched against the caller's own department", async () => {
    grantOnly(
      ["conversation.read", "ORGANIZATION"],
      ["channel.manage", "DEPARTMENT"],
    );
    repository.findVisibleById!.mockResolvedValue(
      makeConversation({
        type: ConversationType.CHANNEL,
        departmentId: "department-1",
      }),
    );
    repository.findUserDepartmentId!.mockResolvedValue("department-1");
    await expect(
      service.updateChannel(ACTOR, "conversation-1", { name: "Renamed" }),
    ).resolves.toBeDefined();

    repository.findUserDepartmentId!.mockResolvedValue("department-2");
    await expectCode(
      service.updateChannel(ACTOR, "conversation-1", { name: "Renamed" }),
      "PERMISSION_DENIED",
    );

    repository.findVisibleById!.mockResolvedValue(
      makeConversation({
        type: ConversationType.CHANNEL,
        workspaceId: "workspace-1",
      }),
    );
    await expectCode(
      service.updateChannel(ACTOR, "conversation-1", { name: "Renamed" }),
      "PERMISSION_DENIED",
    );

    grantOnly(
      ["conversation.read", "ORGANIZATION"],
      ["channel.manage", "ORGANIZATION"],
    );
    await expect(
      service.updateChannel(ACTOR, "conversation-1", { name: "Renamed" }),
    ).resolves.toBeDefined();
  });

  it("excludes the acting user from a direct/group member list and requires a direct conversation to name exactly one other member", async () => {
    await service.createDirectOrGroup(ACTOR, {
      type: ConversationType.GROUP,
      memberIds: [ACTOR, "user-2", "user-2"],
    });
    expect(repository.createDirectOrGroup).toHaveBeenCalledWith(
      expect.objectContaining({ memberIds: ["user-2"] }),
    );

    await expectCode(
      service.createDirectOrGroup(ACTOR, {
        type: ConversationType.DIRECT,
        memberIds: ["user-2", "user-3"],
      }),
      "DIRECT_CONVERSATION_MEMBER_COUNT",
    );

    repository.usersExist!.mockResolvedValue(false);
    await expectCode(
      service.createDirectOrGroup(ACTOR, {
        type: ConversationType.DIRECT,
        memberIds: ["ghost"],
      }),
      "DISCUSS_USER_NOT_FOUND",
    );
  });

  it("validates a channel's owner count and resolves its creation scope before persisting", async () => {
    await expectCode(
      service.createChannel(ACTOR, {
        name: "Invalid",
        visibility: ChannelVisibility.PUBLIC,
        departmentId: "department-1",
        teamId: "team-1",
      }),
      "CHANNEL_OWNER_INVALID",
    );
    expect(repository.createChannel).not.toHaveBeenCalled();

    await expectCode(
      service.createChannel(ACTOR, {
        name: "General",
        visibility: ChannelVisibility.PUBLIC,
      }),
      "PERMISSION_DENIED",
    );

    grantOnly(["channel.create", "DEPARTMENT"]);
    repository.findUserDepartmentId!.mockResolvedValue("department-1");
    await expectCode(
      service.createChannel(ACTOR, {
        name: "Wrong department",
        visibility: ChannelVisibility.PRIVATE,
        departmentId: "department-2",
      }),
      "PERMISSION_DENIED",
    );

    grantOnly(["channel.create", "ORGANIZATION"]);
    repository.workspaceExists!.mockResolvedValue(false);
    await expectCode(
      service.createChannel(ACTOR, {
        name: "Missing workspace",
        visibility: ChannelVisibility.PUBLIC,
        workspaceId: "workspace-1",
      }),
      "DISCUSS_WORKSPACE_NOT_FOUND",
    );
  });

  it("lets any existing GROUP participant add a member, but restricts a CHANNEL to its manager or a public self-join", async () => {
    grantOnly(["conversation.read", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeConversation({ type: ConversationType.GROUP }),
    );
    await expect(
      service.addMember(ACTOR, "conversation-1", "user-2"),
    ).resolves.toBeDefined();

    repository.findVisibleById!.mockResolvedValue(
      makeConversation({
        type: ConversationType.CHANNEL,
        visibility: ChannelVisibility.PUBLIC,
      }),
    );
    await expect(
      service.addMember(ACTOR, "conversation-1", ACTOR),
    ).resolves.toBeDefined();

    repository.findVisibleById!.mockResolvedValue(
      makeConversation({
        type: ConversationType.CHANNEL,
        visibility: ChannelVisibility.PRIVATE,
      }),
    );
    await expectCode(
      service.addMember(ACTOR, "conversation-1", "user-2"),
      "PERMISSION_DENIED",
    );
  });

  it("maps a missing user and repository conflicts for membership changes without exposing persistence details", async () => {
    grantOnly(["conversation.read", "SELF"]);
    repository.findVisibleById!.mockResolvedValue(
      makeConversation({ type: ConversationType.GROUP }),
    );
    repository.addMember!.mockResolvedValue("user_not_found");
    await expectCode(
      service.addMember(ACTOR, "conversation-1", "ghost"),
      "DISCUSS_USER_NOT_FOUND",
    );

    repository.removeMember!.mockResolvedValue("forbidden");
    await expectCode(
      service.removeMember(ACTOR, "conversation-1", ACTOR),
      "PERMISSION_DENIED",
    );
  });

  it("restricts message edit and delete to their author, without revealing existence", async () => {
    repository.updateMessageContent!.mockResolvedValue("forbidden");
    await expectCode(
      service.updateMessage(ACTOR, "conversation-1", "message-1", {
        content: "edited",
      }),
      "PERMISSION_DENIED",
    );

    repository.updateMessageContent!.mockResolvedValue("not_found");
    await expectCode(
      service.updateMessage(ACTOR, "conversation-1", "message-1", {
        content: "edited",
      }),
      "MESSAGE_NOT_FOUND",
    );

    repository.deleteMessage!.mockResolvedValue("forbidden");
    await expectCode(
      service.deleteMessage(ACTOR, "conversation-1", "message-1"),
      "PERMISSION_DENIED",
    );
  });

  it("requires membership to send, list, or pin, mapping conflicts to stable codes", async () => {
    repository.createMessage!.mockResolvedValue("not_member");
    await expectCode(
      service.createMessage(ACTOR, "conversation-1", { content: "hi" }),
      "CONVERSATION_NOT_MEMBER",
    );

    repository.createMessage!.mockResolvedValue("parent_not_found");
    await expectCode(
      service.createMessage(ACTOR, "conversation-1", {
        content: "hi",
        parentMessageId: "missing",
      }),
      "MESSAGE_PARENT_NOT_FOUND",
    );

    repository.listMessages!.mockResolvedValue("not_member");
    await expectCode(
      service.listMessages(ACTOR, "conversation-1", { page: 1, pageSize: 25 }),
      "CONVERSATION_NOT_MEMBER",
    );

    repository.setPin!.mockResolvedValue("not_member");
    await expectCode(
      service.setPin(ACTOR, "conversation-1", "message-1", true),
      "CONVERSATION_NOT_MEMBER",
    );
    repository.setPin!.mockResolvedValue("not_found");
    await expectCode(
      service.setPin(ACTOR, "conversation-1", "message-1", true),
      "MESSAGE_NOT_FOUND",
    );
  });

  it("delegates attachment finalize authorization and recording to the repository", async () => {
    const tx = {} as never;
    repository.lockMessageAttachmentAccess!.mockResolvedValue("not_found");
    await expectCode(
      service.lockAttachmentFinalization(tx, {
        actingUserId: ACTOR,
        conversationId: "conversation-1",
        messageId: "message-1",
      }),
      "MESSAGE_NOT_FOUND",
    );

    repository.lockMessageAttachmentAccess!.mockResolvedValue("forbidden");
    await expectCode(
      service.lockAttachmentFinalization(tx, {
        actingUserId: ACTOR,
        conversationId: "conversation-1",
        messageId: "message-1",
      }),
      "PERMISSION_DENIED",
    );

    repository.lockMessageAttachmentAccess!.mockResolvedValue("visible");
    await service.recordAttachment(tx, {
      actingUserId: ACTOR,
      messageId: "message-1",
      fileId: "file-1",
    });
    expect(repository.createMessageAttachment).toHaveBeenCalledWith(tx, {
      messageId: "message-1",
      fileId: "file-1",
      attachedById: ACTOR,
    });

    repository.findById!.mockResolvedValue(
      makeConversation({ workspaceId: "workspace-1" }),
    );
    repository.isMember!.mockResolvedValue(true);
    repository.hasMessageAttachment!.mockResolvedValue(false);
    await expect(
      service.readAttachmentContext(
        ACTOR,
        "conversation-1",
        "message-1",
        "file-1",
      ),
    ).resolves.toBeNull();

    repository.hasMessageAttachment!.mockResolvedValue(true);
    await expect(
      service.readAttachmentContext(
        ACTOR,
        "conversation-1",
        "message-1",
        "file-1",
      ),
    ).resolves.toEqual({ workspaceId: "workspace-1" });
  });
});
