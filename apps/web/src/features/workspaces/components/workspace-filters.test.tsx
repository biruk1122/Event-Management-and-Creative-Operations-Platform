import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceFilters } from "./workspace-filters";
import { WORKSPACE_KINDS } from "../lib/workspaces-types";

function setup(
  overrides: Partial<Parameters<typeof WorkspaceFilters>[0]> = {},
) {
  const onKindChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <WorkspaceFilters
      kind="EVENT"
      kinds={WORKSPACE_KINDS}
      search=""
      onKindChange={onKindChange}
      onSearchChange={onSearchChange}
      {...overrides}
    />,
  );
  return { onKindChange, onSearchChange };
}

describe("WorkspaceFilters", () => {
  it("reports a chosen kind", async () => {
    const user = userEvent.setup();
    const { onKindChange } = setup();

    await user.click(screen.getByRole("combobox", { name: "Workspace kind" }));
    await user.click(await screen.findByRole("option", { name: "Campaign" }));
    expect(onKindChange).toHaveBeenCalledWith("CAMPAIGN");
  });

  it("keeps the kind control usable when several kinds are readable", () => {
    setup({ kind: "PROJECT", kinds: ["PROJECT", "PRODUCTION"] });
    expect(
      screen.getByRole("combobox", { name: "Workspace kind" }),
    ).toBeEnabled();
  });

  it("disables the kind control when only one kind is readable", () => {
    setup({ kind: "CAMPAIGN", kinds: ["CAMPAIGN"] });
    expect(
      screen.getByRole("combobox", { name: "Workspace kind" }),
    ).toBeDisabled();
  });

  it("reports a search keystroke", async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup();

    await user.type(screen.getByLabelText("Search"), "d");
    expect(onSearchChange).toHaveBeenCalledWith("d");
  });

  it("shows the current search value from its prop", () => {
    setup({ search: "dana" });
    expect(screen.getByLabelText("Search")).toHaveValue("dana");
  });
});
