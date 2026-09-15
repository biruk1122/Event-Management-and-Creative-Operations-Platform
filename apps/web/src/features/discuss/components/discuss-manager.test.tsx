import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { DiscussManager } from "./discuss-manager";
import type { Conversation, Message } from "../lib/discuss-types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: post,
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

const access: CurrentAccess = {
  userId: "viewer-1",
  grants: [{ permissionKey: "conversation.read", scope: "SELF" }],
};

const now = "2026-09-15T09:00:00.000Z";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    type: "DIRECT",
    name: null,
    visibility: null,
    workspaceId: null,
    departmentId: null,
    teamId: null,
    createdBy: null,
    members: [
      {
        id: "viewer-1",
        email: "you@example.com",
        firstName: "You",
        lastName: null,
        joinedAt: now,
        lastReadMessageId: null,
        lastReadAt: now,
      },
      {
        id: "user-2",
        email: "morgan@example.com",
        firstName: "Morgan",
        lastName: "Lead",
        joinedAt: now,
        lastReadMessageId: null,
        lastReadAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    author: {
      id: "user-2",
      email: "morgan@example.com",
      firstName: "Morgan",
      lastName: "Lead",
    },
    parentMessageId: null,
    content: "Hello.",
    editedAt: null,
    deletedAt: null,
    pinnedAt: null,
    pinnedBy: null,
    mentionedUsers: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

afterEach(() => vi.resetAllMocks());

function setup(initialConversationId: string | null = null) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DiscussManager
        kind="dm"
        access={access}
        initialConversationId={initialConversationId}
      />
    </QueryClientProvider>,
  );
  return { user };
}

function mockGet(routes: Record<string, unknown>) {
  get.mockImplementation(async (path: string) => {
    if (!(path in routes)) {
      return {
        data: { items: [], page: 1, pageSize: 100, total: 0 },
        response: { ok: true, status: 200 },
      };
    }
    return { data: routes[path], response: { ok: true, status: 200 } };
  });
}

describe("DiscussManager", () => {
  it("lists conversations from the real API and shows a placeholder", async () => {
    mockGet({
      "/api/v1/conversations": {
        items: [conversation()],
        page: 1,
        pageSize: 25,
        total: 1,
      },
    });
    setup();

    expect(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a conversation to view messages."),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/conversations",
      expect.objectContaining({
        params: { query: { page: 1, pageSize: 25, type: "DIRECT" } },
      }),
    );
  });

  it("shows an empty state when there are no conversations", async () => {
    mockGet({
      "/api/v1/conversations": { items: [], page: 1, pageSize: 25, total: 0 },
    });
    setup();

    expect(
      await screen.findByText("No conversations yet. Start one to get going."),
    ).toBeInTheDocument();
  });

  it("passes the debounced search term to the list endpoint", async () => {
    mockGet({
      "/api/v1/conversations": { items: [], page: 1, pageSize: 25, total: 0 },
    });
    const { user } = setup();
    await screen.findByText("No conversations yet. Start one to get going.");

    await user.type(screen.getByLabelText("Search"), "gala");

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/conversations",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ search: "gala" }),
          },
        }),
      ),
    );
  });

  it("loads messages for the selected conversation from the real API", async () => {
    mockGet({
      "/api/v1/conversations": {
        items: [conversation()],
        page: 1,
        pageSize: 25,
        total: 1,
      },
      "/api/v1/conversations/{id}/messages": {
        items: [message()],
        page: 1,
        pageSize: 50,
        total: 1,
      },
    });
    const { user } = setup();

    await user.click(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    );

    expect(await screen.findByText("Hello.")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/conversations/{id}/messages",
      expect.objectContaining({
        params: expect.objectContaining({
          path: { id: "conversation-1" },
        }),
      }),
    );
  });

  it("sends a message through the real API", async () => {
    mockGet({
      "/api/v1/conversations": {
        items: [conversation()],
        page: 1,
        pageSize: 25,
        total: 1,
      },
      "/api/v1/conversations/{id}/messages": {
        items: [message()],
        page: 1,
        pageSize: 50,
        total: 1,
      },
    });
    post.mockImplementation(async (path: string) => {
      if (path === "/api/v1/conversations/{id}/messages") {
        return {
          data: message({ id: "message-2", content: "New message." }),
          response: { ok: true, status: 201 },
        };
      }
      return { response: { ok: true, status: 200 } };
    });
    const { user } = setup();

    await user.click(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    );
    await screen.findByText("Hello.");
    await user.type(screen.getByLabelText("Message"), "New message.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/conversations/{id}/messages",
        expect.objectContaining({
          params: { path: { id: "conversation-1" } },
          body: expect.objectContaining({ content: "New message." }),
        }),
      ),
    );
  });

  it("shows a list error with a retry action", async () => {
    get.mockResolvedValueOnce({
      data: undefined,
      response: { ok: false, status: 500 },
    });
    get.mockResolvedValue({
      data: { items: [conversation()], page: 1, pageSize: 25, total: 1 },
      response: { ok: true, status: 200 },
    });
    const { user } = setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not load the data. Try again.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    ).toBeInTheDocument();
  });

  it("opens the new-conversation dialog", async () => {
    mockGet({
      "/api/v1/conversations": {
        items: [conversation()],
        page: 1,
        pageSize: 25,
        total: 1,
      },
    });
    const { user } = setup();
    await screen.findByRole("button", { name: /Morgan Lead/ });

    await user.click(screen.getByRole("button", { name: "New conversation" }));

    expect(
      await screen.findByRole("heading", { name: "New conversation" }),
    ).toBeInTheDocument();
  });
});
