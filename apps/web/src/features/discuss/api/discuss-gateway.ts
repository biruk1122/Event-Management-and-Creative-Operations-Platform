import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  AddMember,
  CreateChannel,
  CreateChannelValues,
  DeleteMessage,
  EditMessage,
  MembershipOutcome,
  PinOutcome,
  ReadCursorOutcome,
  RemoveMember,
  SendMessage,
  SendMessageValues,
  SetPin,
  StartConversation,
  StartConversationValues,
  UpdateChannel,
  UpdateChannelOutcome,
  UpdateReadCursor,
} from "../lib/discuss-outcome";
import type {
  ConversationType,
  PaginatedConversations,
  PaginatedMessages,
} from "../lib/discuss-types";

/** A usable error for read failures, including a scope or session change. */
export class DiscussRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This conversation no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "DiscussRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/** Every mutation's coarse failure floor: an org-wide error the caller
 * cannot recover from by changing their input. */
function isPermissionDenied(code: string): boolean {
  return (
    code === "PERMISSION_DENIED" ||
    code === "CSRF_TOKEN_INVALID" ||
    code === "AUTH_UNAUTHENTICATED"
  );
}

export interface ListConversationsParams {
  type?: ConversationType | readonly ConversationType[];
  search?: string;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Discuss_list_v1"]["parameters"]["query"]
>;

async function listConversationsOfType(
  type: ConversationType | undefined,
  params: Pick<ListConversationsParams, "search" | "page" | "pageSize">,
  signal?: AbortSignal,
): Promise<PaginatedConversations> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (type) query.type = type;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET("/api/v1/conversations", {
    // `page`/`pageSize` are modeled as an empty object in the generated types
    // because the API declares them without an explicit numeric type; they
    // are plain integers on the wire (see departments-gateway.ts).
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new DiscussRequestError(response.status);
  return data;
}

/** The API's `type` filter takes a single value (see
 * `ListConversationsQueryDto`), so a multi-type request - the "dm" screen
 * asks for `DIRECT` and `GROUP` together - fetches each type in parallel and
 * merges the pages, newest-first, matching the API's own ordering. */
export async function listConversations(
  params: ListConversationsParams,
  signal?: AbortSignal,
): Promise<PaginatedConversations> {
  const types = params.type
    ? Array.isArray(params.type)
      ? params.type
      : [params.type]
    : [];

  if (types.length <= 1) {
    return listConversationsOfType(types[0], params, signal);
  }

  const pages = await Promise.all(
    types.map((type) => listConversationsOfType(type, params, signal)),
  );
  return {
    items: pages
      .flatMap((page) => page.items)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    total: pages.reduce((sum, page) => sum + page.total, 0),
  };
}

type MessagesQuery = NonNullable<
  operations["Discuss_listMessages_v1"]["parameters"]["query"]
>;

export async function listMessages(
  conversationId: string,
  params: { search?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<PaginatedMessages> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 50,
  };
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET(
    "/api/v1/conversations/{id}/messages",
    {
      params: {
        path: { id: conversationId },
        query: query as unknown as MessagesQuery,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new DiscussRequestError(response.status);
  return data;
}

export type ListAssignablePeople = typeof listAssignablePeople;

export async function listAssignablePeople(signal?: AbortSignal) {
  const { data } = await browserApi.GET("/api/v1/users", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  }));
}

export interface ChannelOwnerOptions {
  workspaces: readonly { id: string; name: string }[];
  departments: readonly { id: string; name: string }[];
  teams: readonly { id: string; name: string }[];
}

const WORKSPACE_KINDS = ["EVENT", "PROJECT", "PRODUCTION", "CAMPAIGN"] as const;
const WORKSPACE_KIND_LABELS: Record<(typeof WORKSPACE_KINDS)[number], string> =
  {
    EVENT: "Event",
    PROJECT: "Project",
    PRODUCTION: "Production",
    CAMPAIGN: "Campaign",
  };

export type ListChannelOwners = typeof listChannelOwners;

/** The channel-owner picker's options. Each list resolves empty rather than
 * throwing when the caller cannot browse that directory, mirroring
 * `listAssignableManagers`. `GET /workspaces` requires an explicit `kind`
 * (see `workspaces-types.ts`), so this fetches all four and merges them; a
 * workspace has no name of its own, so the label pairs its kind with a short
 * id fragment. */
export async function listChannelOwners(
  signal?: AbortSignal,
): Promise<ChannelOwnerOptions> {
  const request = { ...(signal ? { signal } : {}), cache: "no-store" as const };
  const [workspacesByKind, departments, teams] = await Promise.all([
    Promise.all(
      WORKSPACE_KINDS.map((kind) =>
        browserApi.GET("/api/v1/workspaces", {
          params: { query: { kind, pageSize: 100 } as never },
          ...request,
        }),
      ),
    ),
    browserApi.GET("/api/v1/departments", {
      params: { query: { pageSize: 100 } as never },
      ...request,
    }),
    browserApi.GET("/api/v1/teams", {
      params: { query: { pageSize: 100 } as never },
      ...request,
    }),
  ]);
  return {
    workspaces: workspacesByKind.flatMap((result, index) =>
      (result.data?.items ?? []).map((w) => ({
        id: w.id,
        name: `${WORKSPACE_KIND_LABELS[WORKSPACE_KINDS[index]!]} · ${w.id.slice(0, 8)}`,
      })),
    ),
    departments: (departments.data?.items ?? []).map((d) => ({
      id: d.id,
      name: d.name,
    })),
    teams: (teams.data?.items ?? []).map((t) => ({ id: t.id, name: t.name })),
  };
}

function startConversationFailure(
  error: unknown,
  status: number,
): Exclude<Awaited<ReturnType<StartConversation>>, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "DIRECT_CONVERSATION_MEMBER_COUNT")
      return { status: "direct_member_count" };
    if (error.code === "DISCUSS_USER_NOT_FOUND")
      return { status: "user_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      if (fields.memberIds) {
        return {
          status: "field_errors",
          fieldErrors: { memberIds: fields.memberIds },
        };
      }
    }
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const startConversation: StartConversation = async (
  values: StartConversationValues,
) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/conversations",
      { body: values, headers: headers() },
    );
    return data
      ? { status: "success", conversation: data }
      : startConversationFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function createChannelFailure(
  error: unknown,
  status: number,
): Exclude<Awaited<ReturnType<CreateChannel>>, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CHANNEL_OWNER_INVALID")
      return { status: "owner_invalid" };
    if (error.code === "DISCUSS_WORKSPACE_NOT_FOUND")
      return { status: "workspace_not_found" };
    if (error.code === "DISCUSS_DEPARTMENT_NOT_FOUND")
      return { status: "department_not_found" };
    if (error.code === "DISCUSS_TEAM_NOT_FOUND")
      return { status: "team_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof CreateChannelValues, string>> =
        {};
      for (const key of [
        "name",
        "visibility",
        "workspaceId",
        "departmentId",
        "teamId",
      ] as const) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const createChannel: CreateChannel = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/conversations/channels",
      {
        body: {
          name: values.name,
          visibility: values.visibility,
          ...(values.workspaceId ? { workspaceId: values.workspaceId } : {}),
          ...(values.departmentId ? { departmentId: values.departmentId } : {}),
          ...(values.teamId ? { teamId: values.teamId } : {}),
        },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", conversation: data }
      : createChannelFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function updateChannelFailure(
  error: unknown,
  status: number,
): Exclude<UpdateChannelOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CONVERSATION_NOT_FOUND") return { status: "not_found" };
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const updateChannel: UpdateChannel = async (conversationId, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/conversations/{id}",
      {
        params: { path: { id: conversationId } },
        body: values,
        headers: headers(),
      },
    );
    return data
      ? { status: "success", conversation: data }
      : updateChannelFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function membershipFailure(
  error: unknown,
  status: number,
): Exclude<MembershipOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "DISCUSS_USER_NOT_FOUND")
      return { status: "user_not_found" };
    if (error.code === "CONVERSATION_NOT_FOUND") return { status: "not_found" };
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const addMember: AddMember = async (conversationId, userId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/conversations/{id}/members/{userId}",
      { params: { path: { id: conversationId, userId } }, headers: headers() },
    );
    return data
      ? { status: "success", conversation: data }
      : membershipFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeMember: RemoveMember = async (conversationId, userId) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/conversations/{id}/members/{userId}",
      { params: { path: { id: conversationId, userId } }, headers: headers() },
    );
    return data
      ? { status: "success", conversation: data }
      : membershipFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function sendMessageFailure(
  error: unknown,
  status: number,
): Exclude<Awaited<ReturnType<SendMessage>>, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CONVERSATION_NOT_MEMBER")
      return { status: "not_member" };
    if (error.code === "DISCUSS_USER_NOT_FOUND")
      return { status: "user_not_found" };
    if (error.code === "MESSAGE_PARENT_NOT_FOUND")
      return { status: "parent_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<Record<keyof SendMessageValues, string>> = {};
      for (const key of [
        "content",
        "parentMessageId",
        "mentionedUserIds",
      ] as const) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const sendMessage: SendMessage = async (conversationId, values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/conversations/{id}/messages",
      {
        params: { path: { id: conversationId } },
        body: {
          content: values.content,
          ...(values.parentMessageId
            ? { parentMessageId: values.parentMessageId }
            : {}),
          ...(values.mentionedUserIds.length
            ? { mentionedUserIds: values.mentionedUserIds }
            : {}),
        },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", message: data }
      : sendMessageFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function messageFailure(
  error: unknown,
  status: number,
): { status: "not_found" | "permission_denied" | "unexpected" } {
  if (isProblemDetails(error)) {
    if (error.code === "MESSAGE_NOT_FOUND") return { status: "not_found" };
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const editMessage: EditMessage = async (
  conversationId,
  messageId,
  content,
) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/conversations/{id}/messages/{messageId}",
      {
        params: { path: { id: conversationId, messageId } },
        body: { content },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", message: data }
      : messageFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteMessage: DeleteMessage = async (
  conversationId,
  messageId,
) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/conversations/{id}/messages/{messageId}",
      {
        params: { path: { id: conversationId, messageId } },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", message: data }
      : messageFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function pinFailure(
  error: unknown,
): Exclude<PinOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CONVERSATION_NOT_MEMBER")
      return { status: "not_member" };
    if (error.code === "MESSAGE_NOT_FOUND") return { status: "not_found" };
  }
  return { status: "unexpected" };
}

export const setPin: SetPin = async (conversationId, messageId, pinned) => {
  try {
    const { data, error } = pinned
      ? await browserApi.PUT(
          "/api/v1/conversations/{id}/messages/{messageId}/pin",
          {
            params: { path: { id: conversationId, messageId } },
            headers: headers(),
          },
        )
      : await browserApi.DELETE(
          "/api/v1/conversations/{id}/messages/{messageId}/pin",
          {
            params: { path: { id: conversationId, messageId } },
            headers: headers(),
          },
        );
    return data ? { status: "success", message: data } : pinFailure(error);
  } catch {
    return { status: "unexpected" };
  }
};

function readCursorFailure(
  error: unknown,
): Exclude<ReadCursorOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CONVERSATION_NOT_MEMBER")
      return { status: "not_member" };
    if (error.code === "MESSAGE_NOT_FOUND") return { status: "not_found" };
  }
  return { status: "unexpected" };
}

export const updateReadCursor: UpdateReadCursor = async (
  conversationId,
  messageId,
) => {
  try {
    const { error, response } = await browserApi.PUT(
      "/api/v1/conversations/{id}/read-cursor",
      {
        params: { path: { id: conversationId } },
        body: { messageId },
        headers: headers(),
      },
    );
    return response.ok ? { status: "success" } : readCursorFailure(error);
  } catch {
    return { status: "unexpected" };
  }
};
