import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  createChannel,
  deleteMessage,
  editMessage,
  listAssignablePeople,
  listChannelOwners,
  listConversations,
  listMessages,
  removeMember,
  sendMessage,
  setPin,
  startConversation,
  updateChannel,
  updateReadCursor,
  DiscussRequestError,
} from "./discuss-gateway";
import type { CreateChannelValues } from "../lib/discuss-outcome";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, ...(errors ? { errors } : {}) },
  response: { ok: false, status },
});

const CREATE_CHANNEL_VALUES: CreateChannelValues = {
  name: "Announcements",
  visibility: "PUBLIC",
  workspaceId: null,
  departmentId: null,
  teamId: null,
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("discuss gateway reads", () => {
  it("sends type, search, page, and pageSize to the list endpoint", async () => {
    get.mockResolvedValue(ok({ items: [], page: 2, pageSize: 10, total: 0 }));
    await listConversations({
      type: "CHANNEL",
      search: "  gala  ",
      page: 2,
      pageSize: 10,
    });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/conversations",
      expect.objectContaining({
        params: {
          query: { page: 2, pageSize: 10, type: "CHANNEL", search: "gala" },
        },
        cache: "no-store",
      }),
    );
  });

  it("uses only the first type when an array is given, and defaults the page window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    await listConversations({ type: ["DIRECT", "GROUP"] });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/conversations",
      expect.objectContaining({
        params: { query: { page: 1, pageSize: 25, type: "DIRECT" } },
      }),
    );
  });

  it("throws a DiscussRequestError when the list body is missing", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listConversations({})).rejects.toBeInstanceOf(
      DiscussRequestError,
    );
    await expect(listConversations({})).rejects.toMatchObject({
      status: 403,
    });
  });

  it("sends the conversation id and search/page window to the messages endpoint", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 50, total: 0 }));
    await listMessages("conversation-1", { search: "  venue  ", page: 2 });
    expect(get).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages",
      expect.objectContaining({
        params: {
          path: { id: "conversation-1" },
          query: { page: 2, pageSize: 50, search: "venue" },
        },
      }),
    );
  });

  it("throws a DiscussRequestError when messages cannot be read", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 404 },
    });
    await expect(listMessages("missing", {})).rejects.toBeInstanceOf(
      DiscussRequestError,
    );
  });

  it("maps the users page down to assignable people", async () => {
    get.mockResolvedValue(
      ok({
        items: [
          {
            id: "u1",
            email: "m@x.com",
            firstName: "Morgan",
            lastName: "Lead",
            status: "ACTIVE",
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    );
    await expect(listAssignablePeople()).resolves.toEqual([
      { id: "u1", email: "m@x.com", firstName: "Morgan", lastName: "Lead" },
    ]);
  });

  it("resolves an empty people list when the caller cannot read users", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listAssignablePeople()).resolves.toEqual([]);
  });

  it("fetches all four workspace kinds and merges owners", async () => {
    get.mockImplementation(async (path: string, options: unknown) => {
      if (path === "/api/v1/workspaces") {
        const kind = (options as { params: { query: { kind: string } } }).params
          .query.kind;
        return ok({
          items: [{ id: `${kind.toLowerCase()}-1` }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (path === "/api/v1/departments") {
        return ok({
          items: [{ id: "dep-1", name: "Production" }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (path === "/api/v1/teams") {
        return ok({
          items: [{ id: "team-1", name: "On-site crew" }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const owners = await listChannelOwners();

    expect(owners.workspaces).toHaveLength(4);
    expect(owners.workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "event-1", name: "Event · event-1" }),
      ]),
    );
    expect(owners.departments).toEqual([{ id: "dep-1", name: "Production" }]);
    expect(owners.teams).toEqual([{ id: "team-1", name: "On-site crew" }]);
  });

  it("resolves empty owner lists when none can be read", async () => {
    get.mockResolvedValue({
      data: undefined,
      response: { ok: false, status: 403 },
    });
    await expect(listChannelOwners()).resolves.toEqual({
      workspaces: [],
      departments: [],
      teams: [],
    });
  });
});

describe("discuss gateway: startConversation", () => {
  it("echoes the CSRF cookie and returns the created conversation", async () => {
    document.cookie = "csrf_token=csrf-value; path=/";
    post.mockResolvedValue(ok({ id: "conversation-1" }, 201));
    await expect(
      startConversation({ type: "DIRECT", memberIds: ["user-2"] }),
    ).resolves.toEqual({
      status: "success",
      conversation: { id: "conversation-1" },
    });
    expect(post).toHaveBeenCalledWith(
      "/api/v1/conversations",
      expect.objectContaining({
        headers: { "x-csrf-token": "csrf-value" },
        body: { type: "DIRECT", memberIds: ["user-2"] },
      }),
    );
  });

  it.each([
    ["DIRECT_CONVERSATION_MEMBER_COUNT", 400, "direct_member_count"],
    ["DISCUSS_USER_NOT_FOUND", 404, "user_not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["CSRF_TOKEN_INVALID", 403, "permission_denied"],
    ["AUTH_UNAUTHENTICATED", 401, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s into %s", async (code, status, expected) => {
    post.mockResolvedValue(fail(code, status));
    await expect(
      startConversation({ type: "DIRECT", memberIds: ["user-2"] }),
    ).resolves.toEqual({ status: expected });
  });

  it("maps field-level validation errors onto memberIds", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, {
        memberIds: "Choose at least one person.",
      }),
    );
    await expect(
      startConversation({ type: "GROUP", memberIds: [] }),
    ).resolves.toEqual({
      status: "field_errors",
      fieldErrors: { memberIds: "Choose at least one person." },
    });
  });

  it("returns unexpected when the request throws", async () => {
    post.mockRejectedValue(new Error("network"));
    await expect(
      startConversation({ type: "DIRECT", memberIds: ["user-2"] }),
    ).resolves.toEqual({ status: "unexpected" });
  });
});

describe("discuss gateway: createChannel", () => {
  it("omits unset owner fields from the create body", async () => {
    post.mockResolvedValue(ok({ id: "conversation-1" }, 201));
    await createChannel(CREATE_CHANNEL_VALUES);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/conversations/channels",
      expect.objectContaining({
        body: { name: "Announcements", visibility: "PUBLIC" },
      }),
    );
  });

  it("includes a set owner field", async () => {
    post.mockResolvedValue(ok({ id: "conversation-1" }, 201));
    await createChannel({
      ...CREATE_CHANNEL_VALUES,
      departmentId: "dep-1",
    });
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual({
      name: "Announcements",
      visibility: "PUBLIC",
      departmentId: "dep-1",
    });
  });

  it.each([
    ["CHANNEL_OWNER_INVALID", 400, "owner_invalid"],
    ["DISCUSS_WORKSPACE_NOT_FOUND", 404, "workspace_not_found"],
    ["DISCUSS_DEPARTMENT_NOT_FOUND", 404, "department_not_found"],
    ["DISCUSS_TEAM_NOT_FOUND", 404, "team_not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s into %s", async (code, status, expected) => {
    post.mockResolvedValue(fail(code, status));
    await expect(createChannel(CREATE_CHANNEL_VALUES)).resolves.toEqual({
      status: expected,
    });
  });

  it("maps field-level validation errors", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, { name: "name must not be blank" }),
    );
    await expect(createChannel(CREATE_CHANNEL_VALUES)).resolves.toEqual({
      status: "field_errors",
      fieldErrors: { name: "name must not be blank" },
    });
  });
});

describe("discuss gateway: updateChannel", () => {
  it("sends the conversation id and body to the update endpoint", async () => {
    patch.mockResolvedValue(ok({ id: "conversation-1" }));
    await updateChannel("conversation-1", { name: "Renamed" });
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}",
      expect.objectContaining({
        params: { path: { id: "conversation-1" } },
        body: { name: "Renamed" },
      }),
    );
  });

  it.each([
    ["CONVERSATION_NOT_FOUND", 404, "not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s into %s", async (code, status, expected) => {
    patch.mockResolvedValue(fail(code, status));
    await expect(
      updateChannel("conversation-1", { name: "Renamed" }),
    ).resolves.toEqual({ status: expected });
  });
});

describe("discuss gateway: membership", () => {
  it("adds and removes a member by conversation and user id", async () => {
    put.mockResolvedValue(ok({ id: "conversation-1" }));
    del.mockResolvedValue(ok({ id: "conversation-1" }));
    await addMember("conversation-1", "user-2");
    await removeMember("conversation-1", "user-2");
    expect(put).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/members/{userId}",
      expect.objectContaining({
        params: { path: { id: "conversation-1", userId: "user-2" } },
      }),
    );
    expect(del).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/members/{userId}",
      expect.objectContaining({
        params: { path: { id: "conversation-1", userId: "user-2" } },
      }),
    );
  });

  it.each([
    ["DISCUSS_USER_NOT_FOUND", 404, "user_not_found"],
    ["CONVERSATION_NOT_FOUND", 404, "not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s into %s on add", async (code, status, expected) => {
    put.mockResolvedValue(fail(code, status));
    await expect(addMember("conversation-1", "user-2")).resolves.toEqual({
      status: expected,
    });
  });

  it("maps a not-found member on remove", async () => {
    del.mockResolvedValue(fail("CONVERSATION_NOT_FOUND", 404));
    await expect(removeMember("conversation-1", "user-2")).resolves.toEqual({
      status: "not_found",
    });
  });
});

describe("discuss gateway: messages", () => {
  it("sends a message with only the set optional fields", async () => {
    post.mockResolvedValue(ok({ id: "message-1" }, 201));
    await sendMessage("conversation-1", {
      content: "Hello.",
      parentMessageId: null,
      mentionedUserIds: [],
    });
    expect(post).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages",
      expect.objectContaining({
        params: { path: { id: "conversation-1" } },
        body: { content: "Hello." },
      }),
    );
  });

  it("includes parentMessageId and mentionedUserIds when set", async () => {
    post.mockResolvedValue(ok({ id: "message-1" }, 201));
    await sendMessage("conversation-1", {
      content: "Reply.",
      parentMessageId: "message-0",
      mentionedUserIds: ["user-2"],
    });
    const [, options] = post.mock.calls[0]!;
    expect(options.body).toEqual({
      content: "Reply.",
      parentMessageId: "message-0",
      mentionedUserIds: ["user-2"],
    });
  });

  it.each([
    ["CONVERSATION_NOT_MEMBER", 403, "not_member"],
    ["DISCUSS_USER_NOT_FOUND", 404, "user_not_found"],
    ["MESSAGE_PARENT_NOT_FOUND", 404, "parent_not_found"],
    ["PERMISSION_DENIED", 403, "permission_denied"],
    ["INTERNAL_ERROR", 500, "unexpected"],
  ])("maps %s into %s on send", async (code, status, expected) => {
    post.mockResolvedValue(fail(code, status));
    await expect(
      sendMessage("conversation-1", {
        content: "Hello.",
        parentMessageId: null,
        mentionedUserIds: [],
      }),
    ).resolves.toEqual({ status: expected });
  });

  it("maps field-level validation errors on send", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, { content: "content must not be blank" }),
    );
    await expect(
      sendMessage("conversation-1", {
        content: "",
        parentMessageId: null,
        mentionedUserIds: [],
      }),
    ).resolves.toEqual({
      status: "field_errors",
      fieldErrors: { content: "content must not be blank" },
    });
  });

  it("edits and deletes a message by conversation and message id", async () => {
    patch.mockResolvedValue(ok({ id: "message-1" }));
    del.mockResolvedValue(ok({ id: "message-1" }));
    await editMessage("conversation-1", "message-1", "Edited.");
    await deleteMessage("conversation-1", "message-1");
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages/{messageId}",
      expect.objectContaining({
        params: { path: { id: "conversation-1", messageId: "message-1" } },
        body: { content: "Edited." },
      }),
    );
    expect(del).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages/{messageId}",
      expect.objectContaining({
        params: { path: { id: "conversation-1", messageId: "message-1" } },
      }),
    );
  });

  it("maps a not-found message on edit and delete", async () => {
    patch.mockResolvedValue(fail("MESSAGE_NOT_FOUND", 404));
    del.mockResolvedValue(fail("MESSAGE_NOT_FOUND", 404));
    await expect(
      editMessage("conversation-1", "message-1", "Edited."),
    ).resolves.toEqual({ status: "not_found" });
    await expect(deleteMessage("conversation-1", "message-1")).resolves.toEqual(
      { status: "not_found" },
    );
  });

  it("pins and unpins a message", async () => {
    put.mockResolvedValue(ok({ id: "message-1", pinnedAt: "now" }));
    del.mockResolvedValue(ok({ id: "message-1", pinnedAt: null }));
    await expect(setPin("conversation-1", "message-1", true)).resolves.toEqual({
      status: "success",
      message: { id: "message-1", pinnedAt: "now" },
    });
    await expect(setPin("conversation-1", "message-1", false)).resolves.toEqual(
      {
        status: "success",
        message: { id: "message-1", pinnedAt: null },
      },
    );
    expect(put).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages/{messageId}/pin",
      expect.objectContaining({
        params: { path: { id: "conversation-1", messageId: "message-1" } },
      }),
    );
    expect(del).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages/{messageId}/pin",
      expect.objectContaining({
        params: { path: { id: "conversation-1", messageId: "message-1" } },
      }),
    );
  });

  it("maps not-member and not-found on pin", async () => {
    put.mockResolvedValue(fail("CONVERSATION_NOT_MEMBER", 403));
    await expect(setPin("conversation-1", "message-1", true)).resolves.toEqual({
      status: "not_member",
    });

    put.mockResolvedValue(fail("MESSAGE_NOT_FOUND", 404));
    await expect(setPin("conversation-1", "message-1", true)).resolves.toEqual({
      status: "not_found",
    });
  });
});

describe("discuss gateway: updateReadCursor", () => {
  it("treats an empty-body 200 as success", async () => {
    put.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: { ok: true, status: 200 },
    });
    await expect(
      updateReadCursor("conversation-1", "message-1"),
    ).resolves.toEqual({ status: "success" });
    expect(put).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/read-cursor",
      expect.objectContaining({
        params: { path: { id: "conversation-1" } },
        body: { messageId: "message-1" },
      }),
    );
  });

  it("maps not-member and not-found failures", async () => {
    put.mockResolvedValue(fail("CONVERSATION_NOT_MEMBER", 403));
    await expect(
      updateReadCursor("conversation-1", "message-1"),
    ).resolves.toEqual({ status: "not_member" });

    put.mockResolvedValue(fail("MESSAGE_NOT_FOUND", 404));
    await expect(
      updateReadCursor("conversation-1", "message-1"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("returns unexpected on an unmapped failure", async () => {
    put.mockResolvedValue(fail("INTERNAL_ERROR", 500));
    await expect(
      updateReadCursor("conversation-1", "message-1"),
    ).resolves.toEqual({ status: "unexpected" });
  });
});
