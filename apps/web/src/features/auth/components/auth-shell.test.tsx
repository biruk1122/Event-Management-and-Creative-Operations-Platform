import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthShell } from "./auth-shell";

describe("Lela auth shell", () => {
  it("preserves the official logo and real form without unsupported actions", () => {
    render(
      <AuthShell
        title="Welcome back"
        description="Sign in to your Lela work account to continue."
      >
        <form aria-label="Sign in">
          <label htmlFor="email">Email</label>
          <input id="email" />
        </form>
      </AuthShell>,
    );
    expect(screen.getByRole("main")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Lela Creative Management" }),
    ).toHaveAttribute("viewBox", "22 387 785 503");
    expect(screen.getByRole("form", { name: "Sign in" })).toBeVisible();
    expect(
      screen
        .getByRole("img", { name: "Lela Creative Management" })
        .querySelector("image"),
    ).toHaveAttribute("href", "/branding/lela-login-logo.webp");
    expect(
      screen.getByText("Need access? Contact your company administrator."),
    ).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/google|forgot password|sign up/i),
    ).not.toBeInTheDocument();
  });
});
