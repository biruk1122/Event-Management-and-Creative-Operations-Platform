import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

import { MessageComposer } from "./message-composer";
import type {
  ScopedSendMessage,
  SendMessageOutcome,
} from "../lib/discuss-outcome";
import type { DiscussPerson, Message } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";

const PEOPLE: DiscussPerson[] = [
  {
    id: "user-2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
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
    onUpload?: (messageId: string, file: File) => Promise<unknown>;
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
      {...(overrides.onUpload ? { onUpload: overrides.onUpload } : {})}
    />,
  );
  return { user, onSend, onCancelReply };
}

describe("MessageComposer", () => {
  it("returns keyboard focus to the emoji trigger when dismissed with Escape", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", { name: "Choose emoji" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("can discard a permanently rejected attachment and send a new message", async () => {
    const onSend = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({
      onSend,
      onUpload: vi.fn().mockRejectedValue(new Error("File rejected")),
    });
    await user.upload(
      screen.getByLabelText("Choose attachment"),
      new File(["unsafe content"], "rejected.txt", { type: "text/plain" }),
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(
      await screen.findByRole("button", { name: "Discard failed attachment" }),
    );
    expect(screen.getByLabelText("Message")).not.toHaveAttribute("readonly");
    await user.type(screen.getByLabelText("Message"), "A new message{Enter}");
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "A new message" }),
    );
  });
  it("sends with Enter and preserves Shift+Enter as a newline", async () => {
    const onSend = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({ onSend });
    const input = screen.getByLabelText("Message");
    await user.type(input, "First");
    await user.keyboard("{Shift>}{Enter}{/Shift}Second");
    expect(input).toHaveValue("First\nSecond");
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ content: "First\nSecond" }),
      ),
    );
    expect(input).toHaveValue("");
  });

  it("inserts a searched emoji at the caret", async () => {
    const { user } = setup();
    const input = screen.getByLabelText("Message") as HTMLTextAreaElement;
    await user.type(input, "Hello there");
    input.setSelectionRange(5, 5);
    await user.click(screen.getByRole("button", { name: "Choose emoji" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search emojis" }),
      "wave",
    );
    await user.click(screen.getByRole("button", { name: "hello wave" }));
    await waitFor(() => expect(input).toHaveValue("Hello👋 there"));
  });

  it("blocks repeated submissions while a send is pending", async () => {
    let resolve!: (value: SendMessageOutcome) => void;
    const onSend = vi.fn(
      () =>
        new Promise<SendMessageOutcome>((r) => {
          resolve = r;
        }),
    );
    const { user } = setup({ onSend });
    await user.type(screen.getByLabelText("Message"), "One message");
    await user.keyboard("{Enter}{Enter}{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    resolve({ status: "success", message: SENT });
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toHaveValue(""),
    );
  });

  it("keeps the draft on network failure and allows retry", async () => {
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue({ status: "success", message: SENT });
    const { user } = setup({ onSend });
    await user.type(screen.getByLabelText("Message"), "Keep me");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByLabelText("Message")).toHaveValue("Keep me");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toHaveValue(""),
    );
  });

  it("retries a failed attachment without posting a duplicate message", async () => {
    const onSend = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValue({});
    const { user } = setup({ onSend, onUpload });
    await user.upload(
      screen.getByLabelText("Choose attachment"),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Message saved; attachment not sent",
    );
    await user.click(screen.getByRole("button", { name: "Retry attachment" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onSend).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText("notes.txt")).not.toBeInTheDocument(),
    );
  });
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

  it("resets to the placeholder after each pick, so a second mention can be added", async () => {
    const onSend: ScopedSendMessage = vi.fn(() =>
      Promise.resolve<SendMessageOutcome>({ status: "success", message: SENT }),
    );
    const { user } = setup({ onSend });

    const picker = () =>
      screen.getByRole("combobox", { name: "Mention someone" });

    await user.click(
      await screen.findByRole("combobox", { name: "Mention someone" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Morgan Lead" }),
    );
    expect(picker()).toHaveTextContent("Mention");

    await user.click(picker());
    await user.click(
      await screen.findByRole("option", { name: "Dana Okafor" }),
    );
    expect(screen.getByLabelText("Message")).toHaveValue(
      "@Morgan Lead @Dana Okafor ",
    );

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: ["user-1", "user-2"] }),
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
