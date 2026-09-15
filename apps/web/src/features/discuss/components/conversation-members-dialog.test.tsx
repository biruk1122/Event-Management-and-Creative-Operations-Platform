import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConversationMembersDialog } from "./conversation-members-dialog";
import type {
  AddMember,
  MembershipOutcome,
  RemoveMember,
  ScopedUpdateChannel,
  UpdateChannelOutcome,
} from "../lib/discuss-outcome";
import type { Conversation, DiscussPerson } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";

const PEOPLE: DiscussPerson[] = [
  {
    id: "user-1",
    email: "morgan@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
];

const CHANNEL: Conversation = {
  id: "conversation-1",
  type: "CHANNEL",
  name: "Announcements",
  visibility: "PUBLIC",
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
      lastReadAt: null,
    },
  ],
  createdAt: now,
  updatedAt: now,
};

function setup(
  overrides: {
    onAddMember?: AddMember;
    onRemoveMember?: RemoveMember;
    onUpdateChannel?: ScopedUpdateChannel;
    conversation?: Conversation;
  } = {},
) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onChanged = vi.fn();
  const onAddMember: AddMember =
    overrides.onAddMember ??
    vi.fn(() => Promise.resolve<MembershipOutcome>({ status: "unexpected" }));
  const onRemoveMember: RemoveMember =
    overrides.onRemoveMember ??
    vi.fn(() => Promise.resolve<MembershipOutcome>({ status: "unexpected" }));
  const onUpdateChannel: ScopedUpdateChannel =
    overrides.onUpdateChannel ??
    vi.fn(() =>
      Promise.resolve<UpdateChannelOutcome>({ status: "unexpected" }),
    );
  render(
    <ConversationMembersDialog
      open
      onOpenChange={onOpenChange}
      conversation={overrides.conversation ?? CHANNEL}
      listAssignablePeople={() => Promise.resolve(PEOPLE)}
      onAddMember={onAddMember}
      onRemoveMember={onRemoveMember}
      onUpdateChannel={onUpdateChannel}
      onChanged={onChanged}
    />,
  );
  return {
    user,
    onOpenChange,
    onChanged,
    onAddMember,
    onRemoveMember,
    onUpdateChannel,
  };
}

describe("ConversationMembersDialog", () => {
  it("lists current members and offers only non-members to add", async () => {
    setup();
    expect(await screen.findByText("You")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: "Add someone" }));
    expect(
      await screen.findByRole("option", { name: "Morgan Lead" }),
    ).toBeInTheDocument();
  });

  it("adds the chosen person and reports the updated conversation", async () => {
    const updated: Conversation = {
      ...CHANNEL,
      members: [
        ...CHANNEL.members,
        {
          ...PEOPLE[0]!,
          joinedAt: now,
          lastReadMessageId: null,
          lastReadAt: null,
        },
      ],
    };
    const onAddMember: AddMember = vi.fn(() =>
      Promise.resolve<MembershipOutcome>({
        status: "success",
        conversation: updated,
      }),
    );
    const { user, onChanged } = setup({ onAddMember });

    await user.click(screen.getByRole("combobox", { name: "Add someone" }));
    await user.click(
      await screen.findByRole("option", { name: "Morgan Lead" }),
    );

    await waitFor(() =>
      expect(onAddMember).toHaveBeenCalledWith("conversation-1", "user-1"),
    );
    expect(onChanged).toHaveBeenCalledWith(updated);
  });

  it("removes a member and reports the updated conversation", async () => {
    const updated: Conversation = { ...CHANNEL, members: [] };
    const onRemoveMember: RemoveMember = vi.fn(() =>
      Promise.resolve<MembershipOutcome>({
        status: "success",
        conversation: updated,
      }),
    );
    const { user, onChanged } = setup({ onRemoveMember });

    await user.click(await screen.findByRole("button", { name: "Remove You" }));

    await waitFor(() =>
      expect(onRemoveMember).toHaveBeenCalledWith("conversation-1", "viewer-1"),
    );
    expect(onChanged).toHaveBeenCalledWith(updated);
  });

  it("renames the channel", async () => {
    const updated: Conversation = { ...CHANNEL, name: "General" };
    const onUpdateChannel: ScopedUpdateChannel = vi.fn(() =>
      Promise.resolve<UpdateChannelOutcome>({
        status: "success",
        conversation: updated,
      }),
    );
    const { user, onChanged } = setup({ onUpdateChannel });

    const nameInput = await screen.findByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "General");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onUpdateChannel).toHaveBeenCalledWith({ name: "General" }),
    );
    expect(onChanged).toHaveBeenCalledWith(updated);
  });

  it("does not show channel settings for a direct conversation", async () => {
    const direct: Conversation = {
      ...CHANNEL,
      type: "DIRECT",
      name: null,
      visibility: null,
    };
    setup({ conversation: direct });
    await screen.findByText("You");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
});
