import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NewConversationDialog } from "./new-conversation-dialog";
import type {
  StartConversation,
  StartConversationOutcome,
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
  {
    id: "user-2",
    email: "dana@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
];

const STARTED: Conversation = {
  id: "conversation-1",
  type: "DIRECT",
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

function setup(onStart: StartConversation) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onStarted = vi.fn();
  render(
    <NewConversationDialog
      open
      onOpenChange={onOpenChange}
      listAssignablePeople={() => Promise.resolve(PEOPLE)}
      onStart={onStart}
      onStarted={onStarted}
    />,
  );
  return { user, onOpenChange, onStarted };
}

const resolvesTo = (outcome: StartConversationOutcome): StartConversation =>
  vi.fn(() => Promise.resolve(outcome));

describe("NewConversationDialog", () => {
  it("starts a direct message with exactly one chosen person", async () => {
    const onStart = resolvesTo({ status: "success", conversation: STARTED });
    const { user, onStarted, onOpenChange } = setup(onStart);

    await user.click(await screen.findByLabelText("Morgan Lead"));
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        type: "DIRECT",
        memberIds: ["user-1"],
      }),
    );
    expect(onStarted).toHaveBeenCalledWith(STARTED);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selecting a second person for a direct message replaces the first", async () => {
    const onStart = resolvesTo({ status: "success", conversation: STARTED });
    const { user } = setup(onStart);

    await user.click(await screen.findByLabelText("Morgan Lead"));
    await user.click(screen.getByLabelText("Dana Okafor"));
    expect(screen.getByLabelText("Morgan Lead")).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        type: "DIRECT",
        memberIds: ["user-2"],
      }),
    );
  });

  it("requires a person before submitting a direct message", async () => {
    const onStart = resolvesTo({ status: "unexpected" });
    const { user } = setup(onStart);

    await screen.findByLabelText("Morgan Lead");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText(
        "Choose exactly one person for a direct message.",
      ),
    ).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("requires at least one person before submitting a group", async () => {
    const onStart = resolvesTo({ status: "unexpected" });
    const { user } = setup(onStart);

    await user.click(screen.getByRole("radio", { name: "Group" }));
    await screen.findByLabelText("Morgan Lead");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("Choose at least one person."),
    ).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("allows several people once GROUP is chosen", async () => {
    const onStart = resolvesTo({ status: "success", conversation: STARTED });
    const { user } = setup(onStart);

    await user.click(screen.getByRole("radio", { name: "Group" }));
    await user.click(await screen.findByLabelText("Morgan Lead"));
    await user.click(screen.getByLabelText("Dana Okafor"));
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        type: "GROUP",
        memberIds: ["user-1", "user-2"],
      }),
    );
  });

  it("surfaces a missing-user outcome", async () => {
    const onStart = resolvesTo({ status: "user_not_found" });
    const { user } = setup(onStart);

    await user.click(await screen.findByLabelText("Morgan Lead"));
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("One of the selected people no longer exists."),
    ).toBeVisible();
  });

  it("closes on Cancel without starting a conversation", async () => {
    const onStart = resolvesTo({ status: "unexpected" });
    const { user, onOpenChange } = setup(onStart);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onStart).not.toHaveBeenCalled();
  });
});
