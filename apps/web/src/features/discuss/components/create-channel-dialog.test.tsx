import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateChannelDialog } from "./create-channel-dialog";
import type { ChannelOwnerOptions } from "../api/list-channel-owners";
import type {
  CreateChannel,
  CreateChannelOutcome,
} from "../lib/discuss-outcome";
import type { Conversation } from "../lib/discuss-types";

const now = "2026-09-15T09:00:00.000Z";

const OWNERS: ChannelOwnerOptions = {
  workspaces: [{ id: "workspace-1", name: "Autumn Gala (event)" }],
  departments: [{ id: "dep-1", name: "Production" }],
  teams: [{ id: "team-1", name: "On-site crew" }],
};

const CREATED: Conversation = {
  id: "conversation-1",
  type: "CHANNEL",
  name: "Announcements",
  visibility: "PUBLIC",
  workspaceId: null,
  departmentId: null,
  teamId: null,
  createdBy: null,
  members: [],
  createdAt: now,
  updatedAt: now,
};

function setup(onCreate: CreateChannel) {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateChannelDialog
      open
      onOpenChange={onOpenChange}
      listChannelOwners={() => Promise.resolve(OWNERS)}
      onCreate={onCreate}
      onCreated={onCreated}
    />,
  );
  return { user, onOpenChange, onCreated };
}

const resolvesTo = (outcome: CreateChannelOutcome): CreateChannel =>
  vi.fn(() => Promise.resolve(outcome));

describe("CreateChannelDialog", () => {
  it("creates a general-purpose channel with the typed name", async () => {
    const onCreate = resolvesTo({ status: "success", conversation: CREATED });
    const { user, onCreated, onOpenChange } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Announcements");
    await user.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Announcements",
          visibility: "PUBLIC",
          workspaceId: null,
          departmentId: null,
          teamId: null,
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("scopes a channel to a department once chosen as the owner", async () => {
    const onCreate = resolvesTo({ status: "success", conversation: CREATED });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Production planning");
    await user.click(screen.getByRole("combobox", { name: "Owner" }));
    await user.click(
      await screen.findByRole("option", { name: "A department" }),
    );
    await user.click(screen.getByRole("combobox", { name: "A department" }));
    await user.click(await screen.findByRole("option", { name: "Production" }));
    await user.click(screen.getByRole("button", { name: "Create channel" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: "dep-1", workspaceId: null }),
      ),
    );
  });

  it("surfaces an owner-invalid outcome", async () => {
    const onCreate = resolvesTo({ status: "owner_invalid" });
    const { user } = setup(onCreate);

    await user.type(screen.getByLabelText("Name"), "Broken");
    await user.click(screen.getByRole("button", { name: "Create channel" }));

    expect(
      await screen.findByText("A channel may have at most one owner."),
    ).toBeVisible();
  });

  it("closes on Cancel without creating a channel", async () => {
    const onCreate = resolvesTo({ status: "unexpected" });
    const { user, onOpenChange } = setup(onCreate);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
