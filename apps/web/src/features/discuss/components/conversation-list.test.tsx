import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConversationList } from "./conversation-list";
import type { Conversation } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";
const earlier = "2026-09-15T08:00:00.000Z";

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
        joinedAt: earlier,
        lastReadMessageId: null,
        lastReadAt: earlier,
      },
      {
        id: "user-2",
        email: "morgan@example.com",
        firstName: "Morgan",
        lastName: "Lead",
        joinedAt: earlier,
        lastReadMessageId: null,
        lastReadAt: null,
      },
    ],
    createdAt: earlier,
    updatedAt: now,
    ...overrides,
  };
}

describe("ConversationList", () => {
  it("shows a loading state", () => {
    render(
      <ConversationList
        conversations={null}
        viewerId="viewer-1"
        selectedId={null}
        kind="dm"
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Loading conversations" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state for direct messages", () => {
    render(
      <ConversationList
        conversations={[]}
        viewerId="viewer-1"
        selectedId={null}
        kind="dm"
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByText("No conversations yet. Start one to get going."),
    ).toBeInTheDocument();
  });

  it("shows an empty state for channels", () => {
    render(
      <ConversationList
        conversations={[]}
        viewerId="viewer-1"
        selectedId={null}
        kind="channel"
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByText("No channels yet. Create one to get going."),
    ).toBeInTheDocument();
  });

  it("shows the other member's name and marks it unread", () => {
    render(
      <ConversationList
        conversations={[conversation()]}
        viewerId="viewer-1"
        selectedId={null}
        kind="dm"
        onSelect={vi.fn()}
      />,
    );
    const item = screen.getByRole("button", { name: /Morgan Lead/ });
    expect(item).toBeInTheDocument();
    expect(screen.getByLabelText("Unread")).toBeInTheDocument();
  });

  it("does not mark a conversation unread once the viewer has caught up", () => {
    render(
      <ConversationList
        conversations={[conversation({ updatedAt: earlier })]}
        viewerId="viewer-1"
        selectedId={null}
        kind="dm"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument();
  });

  it("calls onSelect with the conversation id and marks it current", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={[conversation()]}
        viewerId="viewer-1"
        selectedId="conversation-1"
        kind="dm"
        onSelect={onSelect}
      />,
    );
    const item = screen.getByRole("button", { name: /Morgan Lead/ });
    expect(item).toHaveAttribute("aria-current", "true");
    await user.click(item);
    expect(onSelect).toHaveBeenCalledWith("conversation-1");
  });
});
