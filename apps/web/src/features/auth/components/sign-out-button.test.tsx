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
    expect(onSignOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Stay signed in" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Yes, sign out" }));

    const pending = await screen.findByRole("button", { name: "Signing out…" });
    expect(pending).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Stay signed in" }),
    ).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(onSignOut).toHaveBeenCalledTimes(1);

    release?.();
    expect(
      await screen.findByRole("button", { name: "Sign out" }),
    ).toBeEnabled();
  });
  it("cancels without ending the session and restores focus", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<SignOutButton onSignOut={onSignOut} />);
    const trigger = screen.getByRole("button", { name: "Sign out" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(onSignOut).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });
  it("keeps confirmation open and allows retry if the handler rejects", async () => {
    const user = userEvent.setup();
    const onSignOut = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    render(<SignOutButton onSignOut={onSignOut} />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(screen.getByRole("button", { name: "Yes, sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be confirmed",
    );
    await user.click(screen.getByRole("button", { name: "Yes, sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(2);
  });
});
