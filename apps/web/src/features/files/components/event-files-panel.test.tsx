import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ query: vi.fn(), mutations: vi.fn() }));
vi.mock("@/features/auth/api/access-queries", () => ({
  useCurrentAccess: () => ({
    data: { userId: "user-1", grants: [] },
    isSuccess: true,
  }),
}));
vi.mock("../api/files-queries", () => ({
  useEventFiles: hooks.query,
  useFileMutations: hooks.mutations,
}));
import { EventFilesPanel } from "./event-files-panel";

const mutation = (fn = vi.fn()) => ({ mutateAsync: fn, isPending: false });
const setup = (query: object) => {
  hooks.query.mockReturnValue(query);
  hooks.mutations.mockReturnValue({
    upload: mutation(),
    remove: mutation(),
    download: mutation(),
  });
};
describe("EventFilesPanel real API states", () => {
  it("maps a list failure to actionable recovery instead of an empty state", () => {
    const refetch = vi.fn();
    setup({
      isPending: false,
      isError: true,
      error: new Error("Your session expired. Sign in again."),
      refetch,
    });
    render(<EventFilesPanel eventId="event-1" canRead canUpdate />);
    expect(screen.getByRole("alert")).toHaveTextContent("session expired");
    expect(screen.queryByText("No files are attached")).not.toBeInTheDocument();
  });
  it("keeps a previous-page escape after a later page becomes empty", async () => {
    const user = userEvent.setup();
    setup({
      isPending: false,
      isError: false,
      data: { items: [], page: 1, pageSize: 20, total: 21 },
    });
    render(<EventFilesPanel eventId="event-1" canRead canUpdate />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });
});
