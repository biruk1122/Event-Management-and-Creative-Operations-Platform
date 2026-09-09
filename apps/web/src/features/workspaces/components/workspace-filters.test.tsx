import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceFilters } from "./workspace-filters";

function setup(
  overrides: Partial<Parameters<typeof WorkspaceFilters>[0]> = {},
) {
  const onKindChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <WorkspaceFilters
      kind={null}
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

    await user.click(screen.getByRole("combobox", { name: "Filter by kind" }));
    await user.click(await screen.findByRole("option", { name: "Campaign" }));
    expect(onKindChange).toHaveBeenCalledWith("CAMPAIGN");
  });

  it("reports the cleared state from a chosen kind", async () => {
    const user = userEvent.setup();
    const { onKindChange } = setup({ kind: "CAMPAIGN" });

    await user.click(screen.getByRole("combobox", { name: "Filter by kind" }));
    await user.click(await screen.findByRole("option", { name: "All kinds" }));
    expect(onKindChange).toHaveBeenCalledWith(null);
  });

  it("reports a search keystroke", async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup();

    // The input is controlled by the parent, so each keystroke reports the
    // single new character against the fixed empty value.
    await user.type(screen.getByLabelText("Search"), "d");
    expect(onSearchChange).toHaveBeenCalledWith("d");
  });

  it("shows the current search value from its prop", () => {
    setup({ search: "dana" });
    expect(screen.getByLabelText("Search")).toHaveValue("dana");
  });
});
