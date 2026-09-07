import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DepartmentFilters } from "./department-filters";
import type { DepartmentActivity } from "../lib/departments-types";

function setup(
  overrides: Partial<Parameters<typeof DepartmentFilters>[0]> = {},
) {
  const props = {
    status: null,
    search: "",
    onStatusChange: vi.fn(),
    onSearchChange: vi.fn(),
    ...overrides,
  };
  render(<DepartmentFilters {...props} />);
  return props;
}

/** A stateful host so the controlled search input accumulates keystrokes. */
function StatefulFilters({
  onSearchChange,
}: {
  onSearchChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DepartmentActivity | null>(null);
  return (
    <DepartmentFilters
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

describe("DepartmentFilters", () => {
  it("passes typed search text to the handler", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<StatefulFilters onSearchChange={onSearchChange} />);
    await user.type(screen.getByLabelText("Search"), "prod");
    expect(onSearchChange).toHaveBeenLastCalledWith("prod");
  });

  it("maps the status selection and reflects the current value", async () => {
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
