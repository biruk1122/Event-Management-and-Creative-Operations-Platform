import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

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
  const rendered = render(
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
  return { user, onRetry, ...rendered };
}

describe("MessageThread", () => {
  it("acknowledges a short conversation after leaving another thread scrolled up", () => {
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const onReadLatest = vi.fn();
    try {
      const { rerender } = setup({
        messages: [message({ id: "first" })],
        onReadLatest,
      });
      const history = screen.getByRole("list", {
        name: "Messages",
      }).parentElement!;
      Object.defineProperty(history, "scrollHeight", {
        configurable: true,
        value: 1000,
      });
      Object.defineProperty(history, "clientHeight", {
        configurable: true,
        value: 100,
      });
      history.scrollTop = 0;
      fireEvent.scroll(history);
      onReadLatest.mockClear();
      Object.defineProperty(history, "scrollHeight", {
        configurable: true,
        value: 50,
      });
      rerender(
        <MessageThread
          conversation={{ ...CONVERSATION, id: "short-conversation" }}
          messages={[
            message({ id: "second", conversationId: "short-conversation" }),
          ]}
          error={null}
          viewerId="author-1"
          onRetry={vi.fn()}
          onEdit={noop}
          onDelete={noop}
          onTogglePin={noop}
          onReply={vi.fn()}
          onReadLatest={onReadLatest}
        />,
      );
      expect(onReadLatest).toHaveBeenCalledWith("second");
    } finally {
      focus.mockRestore();
    }
  });
  it("only shows read checks up to the recipient's persisted cursor", () => {
    const member = {
      id: "recipient",
      email: "reader@example.com",
      firstName: null,
      lastName: null,
      joinedAt: now,
      lastReadAt: "2030-01-01T00:00:00.000Z",
      lastReadMessageId: "m1",
    };
    setup({
      conversation: { ...CONVERSATION, type: "DIRECT", members: [member] },
      messages: [
        message({ id: "m2", content: "Not read" }),
        message({ id: "m1", content: "Read this" }),
      ],
    });
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.querySelector('[aria-label="Read"]')).not.toBeNull();
    expect(items[1]?.querySelector('[aria-label="Sent"]')).not.toBeNull();
  });
  it("labels group receipts as a member count rather than everyone read", () => {
    setup({
      conversation: {
        ...CONVERSATION,
        members: [
          {
            id: "recipient",
            email: "reader@example.com",
            firstName: null,
            lastName: null,
            joinedAt: now,
            lastReadAt: now,
            lastReadMessageId: "m1",
          },
        ],
      },
      messages: [message({ id: "m1" })],
    });
    expect(screen.getByLabelText("Read by 1 member")).toBeInTheDocument();
    expect(screen.queryByLabelText("Read")).not.toBeInTheDocument();
  });
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
