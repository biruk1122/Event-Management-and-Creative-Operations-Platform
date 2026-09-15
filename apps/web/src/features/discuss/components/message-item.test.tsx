import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageItem } from "./message-item";
import type {
  DeleteMessageOutcome,
  EditMessageOutcome,
  PinOutcome,
  ScopedDeleteMessage,
  ScopedEditMessage,
  ScopedSetPin,
} from "../lib/discuss-outcome";
import type { Message } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";

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
    content: "The venue is confirmed.",
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
    message?: Message;
    viewerId?: string;
    onEdit?: ScopedEditMessage;
    onDelete?: ScopedDeleteMessage;
    onTogglePin?: ScopedSetPin;
    onReply?: (message: Message) => void;
  } = {},
) {
  const user = userEvent.setup();
  const onEdit: ScopedEditMessage =
    overrides.onEdit ??
    vi.fn(() => Promise.resolve<EditMessageOutcome>({ status: "unexpected" }));
  const onDelete: ScopedDeleteMessage =
    overrides.onDelete ??
    vi.fn(() =>
      Promise.resolve<DeleteMessageOutcome>({ status: "unexpected" }),
    );
  const onTogglePin: ScopedSetPin =
    overrides.onTogglePin ??
    vi.fn(() => Promise.resolve<PinOutcome>({ status: "unexpected" }));
  const onReply = overrides.onReply ?? vi.fn();
  render(
    <ul>
      <MessageItem
        message={overrides.message ?? message()}
        viewerId={overrides.viewerId ?? "author-1"}
        parentPreview={null}
        onEdit={onEdit}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onReply={onReply}
      />
    </ul>,
  );
  return { user, onEdit, onDelete, onTogglePin, onReply };
}

describe("MessageItem", () => {
  it("shows the author, content, and timestamp", () => {
    setup();
    expect(screen.getByText("Morgan Lead")).toBeInTheDocument();
    expect(screen.getByText("The venue is confirmed.")).toBeInTheDocument();
  });

  it("renders a placeholder instead of content once deleted", () => {
    setup({ message: message({ deletedAt: now, content: "" }) });
    expect(screen.getByText("Message deleted.")).toBeInTheDocument();
    expect(
      screen.queryByText("The venue is confirmed."),
    ).not.toBeInTheDocument();
  });

  it("only offers edit and delete to the author", () => {
    setup({ viewerId: "someone-else" });
    expect(
      screen.queryByRole("button", { name: "Edit message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete message" }),
    ).not.toBeInTheDocument();
  });

  it("edits the message content", async () => {
    const onEdit: ScopedEditMessage = vi.fn(() =>
      Promise.resolve<EditMessageOutcome>({
        status: "success",
        message: message({ content: "Updated.", editedAt: now }),
      }),
    );
    const { user } = setup({ onEdit });

    await user.click(screen.getByRole("button", { name: "Edit message" }));
    const textarea = screen.getByLabelText("Message");
    await user.clear(textarea);
    await user.type(textarea, "Updated content");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith("message-1", "Updated content"),
    );
  });

  it("deletes the message", async () => {
    const onDelete: ScopedDeleteMessage = vi.fn(() =>
      Promise.resolve<DeleteMessageOutcome>({
        status: "success",
        message: message({ deletedAt: now, content: "" }),
      }),
    );
    const { user } = setup({ onDelete });

    await user.click(screen.getByRole("button", { name: "Delete message" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("message-1"));
  });

  it("toggles pin for any viewer, not just the author", async () => {
    const onTogglePin: ScopedSetPin = vi.fn(() =>
      Promise.resolve<PinOutcome>({
        status: "success",
        message: message({ pinnedAt: now }),
      }),
    );
    const { user } = setup({ viewerId: "someone-else", onTogglePin });

    await user.click(screen.getByRole("button", { name: "Pin message" }));

    await waitFor(() =>
      expect(onTogglePin).toHaveBeenCalledWith("message-1", true),
    );
  });

  it("invokes onReply with the message", async () => {
    const { user, onReply } = setup();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).toHaveBeenCalledWith(message());
  });

  it("shows a pinned indicator", () => {
    setup({ message: message({ pinnedAt: now }) });
    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("shows mentioned users", () => {
    setup({
      message: message({
        mentionedUsers: [
          {
            id: "user-2",
            email: "dana@example.com",
            firstName: "Dana",
            lastName: "Okafor",
          },
        ],
      }),
    });
    expect(screen.getByText("cc Dana Okafor")).toBeInTheDocument();
  });
});
