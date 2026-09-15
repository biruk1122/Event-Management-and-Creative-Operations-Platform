import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageComposer } from "./message-composer";
import type {
  ScopedSendMessage,
  SendMessageOutcome,
} from "../lib/discuss-outcome";
import type { DiscussPerson, Message } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";

const PEOPLE: DiscussPerson[] = [
  {
    id: "user-1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];

const SENT: Message = {
  id: "message-1",
  conversationId: "conversation-1",
  author: null,
  parentMessageId: null,
  content: "Hello there.",
  editedAt: null,
  deletedAt: null,
  pinnedAt: null,
  pinnedBy: null,
  mentionedUsers: [],
  createdAt: now,
  updatedAt: now,
};

const REPLY_TARGET: Message = {
  ...SENT,
  id: "parent-1",
  content: "Original message.",
};

function setup(
  overrides: {
    onSend?: ScopedSendMessage;
    replyTarget?: Message | null;
  } = {},
) {
  const user = userEvent.setup();
  const onCancelReply = vi.fn();
  const onSend: ScopedSendMessage =
    overrides.onSend ??
    vi.fn(() => Promise.resolve<SendMessageOutcome>({ status: "unexpected" }));
  render(
    <MessageComposer
      replyTarget={overrides.replyTarget ?? null}
      onCancelReply={onCancelReply}
      onSend={onSend}
      listAssignablePeople={() => Promise.resolve(PEOPLE)}
    />,
  );
  return { user, onSend, onCancelReply };
}

describe("MessageComposer", () => {
  it("sends the typed content", async () => {
    const onSend: ScopedSendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({ onSend });

    await user.type(screen.getByLabelText("Message"), "Hello there.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        content: "Hello there.",
        parentMessageId: null,
        mentionedUserIds: [],
      }),
    );
  });

  it("clears the input after a successful send", async () => {
    const onSend: ScopedSendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({ onSend });

    const textarea = screen.getByLabelText("Message");
    await user.type(textarea, "Hello there.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("shows the reply banner and includes the parent id when sending", async () => {
    const onSend: ScopedSendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({ onSend, replyTarget: REPLY_TARGET });

    expect(
      screen.getByText("Replying to: Original message."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Message"), "A reply.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ parentMessageId: "parent-1" }),
      ),
    );
  });

  it("cancels a reply", async () => {
    const { user, onCancelReply } = setup({ replyTarget: REPLY_TARGET });
    await user.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(onCancelReply).toHaveBeenCalled();
  });

  it("mentions a person from the picker and includes them when sending", async () => {
    const onSend: ScopedSendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({ onSend });

    await user.click(
      await screen.findByRole("combobox", { name: "Mention someone" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Morgan Lead" }),
    );
    expect(screen.getByLabelText("Message")).toHaveValue("@Morgan Lead ");

    await user.type(screen.getByLabelText("Message"), "cc'd above.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: ["user-1"] }),
      ),
    );
  });

  it("surfaces a not-member outcome", async () => {
    const onSend: ScopedSendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "not_member" }),
    );
    const { user } = setup({ onSend });

    await user.type(screen.getByLabelText("Message"), "Hello.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(
        "You are no longer a member of this conversation.",
      ),
    ).toBeVisible();
  });
});
