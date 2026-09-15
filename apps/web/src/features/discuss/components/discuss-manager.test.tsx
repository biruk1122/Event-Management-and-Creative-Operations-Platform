import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DiscussManager } from "./discuss-manager";
import type { ListConversations } from "../api/list-conversations";
import type { ListMessages } from "../api/list-messages";
import type { SendMessage, SendMessageOutcome } from "../lib/discuss-outcome";
import type {
  Conversation,
  Message,
  PaginatedConversations,
  PaginatedMessages,
} from "../lib/discuss-types";

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

function setup(
  overrides: {
    listConversations?: ListConversations;
    listMessages?: ListMessages;
    sendMessage?: SendMessage;
  } = {},
) {
  const user = userEvent.setup();
  const listConversations: ListConversations =
    overrides.listConversations ??
    vi.fn(() =>
      Promise.resolve<PaginatedConversations>({
        items: [conversation()],
        page: 1,
        pageSize: 25,
        total: 1,
      }),
    );
  const listMessages: ListMessages =
    overrides.listMessages ??
    vi.fn(() =>
      Promise.resolve<PaginatedMessages>({
        items: [message()],
        page: 1,
        pageSize: 50,
        total: 1,
      }),
    );
  const sendMessage: SendMessage =
    overrides.sendMessage ??
    vi.fn(() => Promise.resolve<SendMessageOutcome>({ status: "unexpected" }));
  render(
    <DiscussManager
      kind="dm"
      viewerId="viewer-1"
      initialConversationId={null}
      listConversations={listConversations}
      listMessages={listMessages}
      sendMessage={sendMessage}
    />,
  );
  return { user, listConversations, listMessages, sendMessage };
}

describe("DiscussManager", () => {
  it("lists conversations and shows a select-a-conversation placeholder", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a conversation to view messages."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no conversations", async () => {
    setup({
      listConversations: vi.fn(() =>
        Promise.resolve<PaginatedConversations>({
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
        }),
      ),
    });
    expect(
      await screen.findByText("No conversations yet. Start one to get going."),
    ).toBeInTheDocument();
  });

  it("loads and shows messages once a conversation is selected", async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    );
    expect(await screen.findByText("Hello.")).toBeInTheDocument();
  });

  it("sends a message and shows it in the thread", async () => {
    const sendMessage: SendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({
        status: "success",
        message: message({ id: "message-2", content: "New message." }),
      }),
    );
    const { user } = setup({ sendMessage });

    await user.click(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    );
    await screen.findByText("Hello.");
    await user.type(screen.getByLabelText("Message"), "New message.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        "conversation-1",
        expect.objectContaining({ content: "New message." }),
      ),
    );
    expect(await screen.findByText("New message.")).toBeInTheDocument();
  });

  it("opens the new-conversation dialog", async () => {
    const { user } = setup();
    await screen.findByRole("button", { name: /Morgan Lead/ });
    await user.click(screen.getByRole("button", { name: "New conversation" }));
    expect(
      await screen.findByRole("heading", { name: "New conversation" }),
    ).toBeInTheDocument();
  });

  it("shows a list error with a retry action", async () => {
    let calls = 0;
    const listConversations: ListConversations = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("boom"))
        : Promise.resolve<PaginatedConversations>({
            items: [conversation()],
            page: 1,
            pageSize: 25,
            total: 1,
          });
    });
    const { user } = setup({ listConversations });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not load the list. Try again.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Morgan Lead/ }),
    ).toBeInTheDocument();
  });
});
