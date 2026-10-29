import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TASK_WORKSPACE_FIXTURE } from "../lib/task-fixtures";
import { TaskWorkspace } from "./tasks-workspace";

function renderWorkspace(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("TaskWorkspace", () => {
  it("switches between the accessible list, board, and calendar projections", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    expect(screen.getByRole("table")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Board" }));
    expect(screen.getByRole("region", { name: "To do tasks" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Under review tasks" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Blocked tasks" }),
    ).toHaveTextContent("Receive catering confirmation");

    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("region", { name: "Task calendar" })).toBeVisible();
    expect(screen.getByText("Confirm venue accessibility plan")).toBeVisible();
  });

  it("filters tasks and gives a clear empty-state recovery message", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    await user.type(screen.getByLabelText("Search tasks"), "not-a-task");

    expect(screen.getByText("No tasks match these filters")).toBeVisible();
    expect(
      screen.getByText("Clear a filter or adjust your search to see tasks."),
    ).toBeVisible();
  });

  it("opens task detail with collaborators, attachments, comments, and activity", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    await user.click(
      screen.getAllByRole("button", {
        name: "Confirm venue accessibility plan",
      })[0]!,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(screen.getByRole("heading", { name: "Assignees" })).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Task assignees" }),
    ).toHaveTextContent("Maya Chen");
    expect(dialog).toHaveTextContent("accessible-route-map.pdf");
    // Regression guard: the backend's real ManagedFileResponse.state is
    // lowercase ("available"/"pending"), not "AVAILABLE" - a prior bug
    // compared against the uppercase value and so never rendered this
    // button for any available file, for anyone.
    expect(
      screen.getByRole("button", {
        name: "Download accessible-route-map.pdf",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("The venue has sent the revised accessible-route map."),
    ).toBeVisible();
    expect(dialog).toHaveTextContent("No review has been recorded.");
  });

  it("hides the download control for a file still pending verification", async () => {
    const user = userEvent.setup();
    const pendingFixture = {
      ...TASK_WORKSPACE_FIXTURE,
      details: {
        ...TASK_WORKSPACE_FIXTURE.details,
        [TASK_WORKSPACE_FIXTURE.tasks[0]!.id]: {
          ...TASK_WORKSPACE_FIXTURE.details[TASK_WORKSPACE_FIXTURE.tasks[0]!.id]!,
          files: [
            {
              id: "f0f00000-0000-4000-8000-000000000099",
              filename: "still-scanning.pdf",
              mediaType: "application/pdf",
              sizeBytes: 1000,
              state: "pending" as const,
              createdAt: "2026-09-15T10:00:00.000Z",
            },
          ],
        },
      },
    };
    renderWorkspace(<TaskWorkspace data={pendingFixture} />);

    await user.click(
      screen.getAllByRole("button", {
        name: "Confirm venue accessibility plan",
      })[0]!,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("still-scanning.pdf");
    expect(
      screen.queryByRole("button", { name: "Download still-scanning.pdf" }),
    ).not.toBeInTheDocument();
  });

  it("shows the checklist-derived progress bar instead of a manual numeric input", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    await user.click(
      screen.getAllByRole("button", {
        name: "Confirm venue accessibility plan",
      })[0]!,
    );

    const dialog = screen.getByRole("dialog");
    expect(
      screen.getByRole("progressbar", { name: "Task progress" }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent("No checkpoints yet.");
    expect(screen.queryByLabelText("Update progress")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: "Update progress" }),
    ).not.toBeInTheDocument();
  });

  it("shows an actionable recoverable loading error", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    renderWorkspace(
      <TaskWorkspace
        data={TASK_WORKSPACE_FIXTURE}
        error="The task service did not respond."
        onRetry={retry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tasks could not be loaded",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("uses mobile-first and larger-screen layout classes for the primary views", () => {
    const { container } = renderWorkspace(
      <TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />,
    );
    expect(
      container.querySelector("table")?.parentElement?.className,
    ).toContain("sm:block");
    expect(container.querySelector("section")?.className).toContain(
      "space-y-5",
    );
    expect(screen.getByRole("list", { name: "Task list" })).toBeVisible();
  });

  it("uses ordinary keyboard-operable view buttons instead of incomplete tab semantics", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    const board = screen.getByRole("button", { name: "Board" });
    board.focus();
    await user.keyboard("{Enter}");

    expect(board).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "To do tasks" })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows the list toolbar with row numbering and a type column, with no header filters", () => {
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    const table = screen.getByRole("table");
    for (const header of [
      "No",
      "Task Description",
      "Assigned People",
      "Due Date",
      "Type",
      "Stage",
      "File",
      "Action",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeVisible();
    }
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("Logistics");
    expect(rows[4]).toHaveTextContent("5");
    // The Assigned People / Stage / Due Date header filters and sort toggle
    // were removed - these columns just display data, like every other one.
    expect(
      screen.queryByRole("button", { name: /Filter by/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Sort by due date/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the task's description, truncated, under its title in the list", () => {
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    const table = screen.getByRole("table");
    const description =
      "Confirm step-free routes and reserve accessible seating.";
    const cell = within(table).getByText(description);
    expect(cell).toBeVisible();
    expect(cell.className).toContain("truncate");
    expect(cell).toHaveAttribute("title", description);
  });
});
