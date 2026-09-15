import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageThread } from "./message-thread";
import type { Conversation, Message } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";

const CONVERSATION: Conversation = {
  id: "conversation-1",
  type: "GROUP",
  name: null,
  visibility: null,
  workspaceId: null,
  departmentId: null,
  teamId: null,
  createdBy: null,
  members: [],
  createdAt: now,
  updatedAt: now,
};

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    author: {
      id: "author-1",
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

const noop = vi.fn(() => Promise.resolve({ status: "unexpected" }) as never);

function setup(props: Partial<ComponentProps<typeof MessageThread>> = {}) {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(
    <MessageThread
      conversation={CONVERSATION}
      messages={null}
      error={null}
      viewerId="author-1"
      onRetry={onRetry}
      onEdit={noop}
      onDelete={noop}
      onTogglePin={noop}
      onReply={vi.fn()}
      {...props}
    />,
  );
  return { user, onRetry };
}

describe("MessageThread", () => {
  it("shows a loading state", () => {
    setup({ messages: null });
    expect(
      screen.getByRole("status", { name: "Loading messages" }),
    ).toBeInTheDocument();
  });

  it("shows an error state with a retry action", async () => {
    const { user, onRetry } = setup({
      error: "We could not load the messages. Try again.",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load the messages. Try again.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows an empty state", () => {
    setup({ messages: [] });
    expect(screen.getByText("No messages yet. Say hello.")).toBeInTheDocument();
  });

  it("renders messages oldest to newest, given a newest-first API order", () => {
    setup({
      messages: [
        message({
          id: "m2",
          content: "Second",
          createdAt: "2026-09-15T10:00:00.000Z",
        }),
        message({
          id: "m1",
          content: "First",
          createdAt: "2026-09-15T09:00:00.000Z",
        }),
      ],
    });
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("First");
    expect(items[1]).toHaveTextContent("Second");
  });

  it("shows a reply preview sourced from the parent message", () => {
    setup({
      messages: [
        message({ id: "m1", content: "Original" }),
        message({
          id: "m2",
          content: "A reply",
          parentMessageId: "m1",
          createdAt: "2026-09-15T10:00:00.000Z",
        }),
      ],
    });
    expect(screen.getByText("Replying to: Original")).toBeInTheDocument();
  });
});
