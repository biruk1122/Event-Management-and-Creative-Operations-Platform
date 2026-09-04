import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignOut } from "./sign-out";

const { replace, refresh, mutateAsync } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("../api/auth-queries", () => ({
  useLogoutMutation: () => ({ mutateAsync }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignOut", () => {
  it("revokes the session and routes to sign in", async () => {
    mutateAsync.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SignOut />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("still routes to sign in when the revoke request fails", async () => {
    mutateAsync.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<SignOut />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
