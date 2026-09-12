import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectsTable } from "./projects-table";
import type { Project } from "../lib/projects-types";

const now = "2026-09-01T09:00:00.000Z";

function makeProject(
  overrides: Partial<Project> & Pick<Project, "id" | "name">,
): Project {
  return {
    workspaceId: `ws-${overrides.id}`,
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ProjectsTable", () => {
  it("shows an empty state that reflects whether filters are active", () => {
    const { rerender } = render(
      <ProjectsTable
        projects={[]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );
    expect(screen.getByText("No projects yet")).toBeVisible();

    rerender(
      <ProjectsTable
        projects={[]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered
      />,
    );
    expect(screen.getByText("No projects match these filters")).toBeVisible();
  });

  it("renders a row per project and selects one on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ProjectsTable
        projects={[
          makeProject({
            id: "p1",
            name: "Brand Refresh",
            status: "ACTIVE",
            startAt: "2026-10-04T18:00:00.000Z",
          }),
          makeProject({ id: "p2", name: "Venue Partnership Program" }),
        ]}
        onSelect={onSelect}
        page={1}
        pageCount={1}
        onPageChange={vi.fn()}
        filtered={false}
      />,
    );

    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    await user.click(
      screen.getAllByRole("button", { name: "Brand Refresh" })[0]!,
    );
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("shows pagination only when there is more than one page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <ProjectsTable
        projects={[makeProject({ id: "p1", name: "One" })]}
        onSelect={vi.fn()}
        page={1}
        pageCount={1}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Projects pagination" }),
    ).not.toBeInTheDocument();

    rerender(
      <ProjectsTable
        projects={[makeProject({ id: "p1", name: "One" })]}
        onSelect={vi.fn()}
        page={1}
        pageCount={3}
        onPageChange={onPageChange}
        filtered={false}
      />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
