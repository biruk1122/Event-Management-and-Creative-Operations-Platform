import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TeamFilters } from "./team-filters";
import type { AssignableDepartment, TeamActivity } from "../lib/teams-types";

const DEPARTMENTS: AssignableDepartment[] = [
  { id: "dep-1", name: "Production" },
  { id: "dep-2", name: "Marketing" },
];

function setup(overrides: Partial<Parameters<typeof TeamFilters>[0]> = {}) {
  const props = {
    status: null,
    departmentId: null,
    search: "",
    departments: DEPARTMENTS,
    onStatusChange: vi.fn(),
    onDepartmentChange: vi.fn(),
    onSearchChange: vi.fn(),
    ...overrides,
  };
  render(<TeamFilters {...props} />);
  return props;
}

/** A stateful host so the controlled search input accumulates keystrokes. */
function StatefulFilters({
  onSearchChange,
}: {
  onSearchChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TeamActivity | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  return (
    <TeamFilters
      status={status}
      departmentId={departmentId}
      search={search}
      departments={DEPARTMENTS}
      onStatusChange={setStatus}
      onDepartmentChange={setDepartmentId}
      onSearchChange={(value) => {
        setSearch(value);
        onSearchChange(value);
      }}
    />
  );
}

describe("TeamFilters", () => {
  it("passes typed search text to the handler", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<StatefulFilters onSearchChange={onSearchChange} />);
    await user.type(screen.getByLabelText("Search"), "prod");
    expect(onSearchChange).toHaveBeenLastCalledWith("prod");
  });

  it("maps the status selection", async () => {
    const user = userEvent.setup();
    const { onStatusChange } = setup();
    await user.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Inactive" }));
    expect(onStatusChange).toHaveBeenLastCalledWith("INACTIVE");
  });

  it("maps the department selection", async () => {
    const user = userEvent.setup();
    const { onDepartmentChange } = setup();
    await user.click(
      screen.getByRole("combobox", { name: "Filter by department" }),
    );
    await user.click(await screen.findByRole("option", { name: "Marketing" }));
    expect(onDepartmentChange).toHaveBeenLastCalledWith("dep-2");
  });

  it("reflects the current status and department values", () => {
    setup({ status: "ACTIVE", departmentId: "dep-1" });
    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toHaveTextContent("Active");
    expect(
      screen.getByRole("combobox", { name: "Filter by department" }),
    ).toHaveTextContent("Production");
  });
});
