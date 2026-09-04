import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  it("runs the handler and shows progress until it settles", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const onSignOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    render(<SignOutButton onSignOut={onSignOut} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const pending = await screen.findByRole("button", { name: "Signing out…" });
    expect(pending).toBeDisabled();
    expect(onSignOut).toHaveBeenCalledTimes(1);

    release?.();
    expect(
      await screen.findByRole("button", { name: "Sign out" }),
    ).toBeEnabled();
  });
});
