import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserFilters } from "./user-filters";
import type { UserStatus } from "../lib/users-types";

function setup(overrides: Partial<Parameters<typeof UserFilters>[0]> = {}) {
  const props = {
    status: null,
    search: "",
    onStatusChange: vi.fn(),
    onSearchChange: vi.fn(),
    ...overrides,
  };
  render(<UserFilters {...props} />);
  return props;
}

/** A stateful host so the controlled search input accumulates keystrokes. */
function StatefulFilters({
  onSearchChange,
}: {
  onSearchChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | null>(null);
  return (
    <UserFilters
      status={status}
      search={search}
      onStatusChange={setStatus}
      onSearchChange={(value) => {
        setSearch(value);
        onSearchChange(value);
      }}
    />
  );
}

describe("UserFilters", () => {
  it("passes typed search text to the handler", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<StatefulFilters onSearchChange={onSearchChange} />);
    await user.type(screen.getByLabelText("Search"), "ada");
    expect(onSearchChange).toHaveBeenLastCalledWith("ada");
  });

  it("maps the status selection, and 'All' back to null", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = setup();

    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));
    expect(onStatusChange).toHaveBeenLastCalledWith("INACTIVE");
  });

  it("reflects the current status value", () => {
    setup({ status: "ACTIVE" });
    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toHaveTextContent("Active");
  });
});
