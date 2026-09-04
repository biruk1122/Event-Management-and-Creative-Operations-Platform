import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LoginOutcome, SubmitLogin } from "../lib/login-outcome";
import { LoginForm } from "./login-form";

function setup(onSubmit: SubmitLogin) {
  const user = userEvent.setup();
  render(<LoginForm onSubmit={onSubmit} />);
  return {
    user,
    email: screen.getByLabelText("Email"),
    password: screen.getByLabelText("Password"),
    submit: screen.getByRole("button", { name: "Sign in" }),
  };
}

const resolvesTo = (outcome: LoginOutcome): SubmitLogin =>
  vi.fn(() => Promise.resolve(outcome));

describe("LoginForm", () => {
  it("blocks submission and shows field messages when the form is empty", async () => {
    const onSubmit = resolvesTo({ status: "success" });
    const { user, submit } = setup(onSubmit);

    await user.click(submit);

    expect(await screen.findByText("Enter your email address.")).toBeVisible();
    expect(screen.getByText("Enter your password.")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a malformed email without calling the handler", async () => {
    const onSubmit = resolvesTo({ status: "success" });
    const { user, email, password, submit } = setup(onSubmit);

    await user.type(email, "not-an-email");
    await user.type(password, "secret123");
    await user.click(submit);

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values and confirms success", async () => {
    const onSubmit = resolvesTo({ status: "success" });
    const { user, email, password, submit } = setup(onSubmit);

    await user.type(email, "  manager@example.com  ");
    await user.type(password, "correct horse");
    await user.click(submit);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: "manager@example.com",
        password: "correct horse",
      }),
    );
    expect(await screen.findByText("You are signed in")).toBeVisible();
  });

  it("shows an assertive error and keeps the typed values on invalid credentials", async () => {
    const onSubmit = resolvesTo({ status: "invalid_credentials" });
    const { user, email, password, submit } = setup(onSubmit);

    await user.type(email, "manager@example.com");
    await user.type(password, "wrong-password");
    await user.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your email or password is incorrect");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(email).toHaveValue("manager@example.com");
    expect(password).toHaveValue("wrong-password");
  });

  it.each([
    ["account_locked", "This account is temporarily locked"],
    ["rate_limited", "Too many attempts"],
    ["unexpected", "Something went wrong"],
  ] as const)("surfaces the %s state", async (status, heading) => {
    const onSubmit = resolvesTo({ status });
    const { user, email, password, submit } = setup(onSubmit);

    await user.type(email, "manager@example.com");
    await user.type(password, "secret123");
    await user.click(submit);

    expect(await screen.findByText(heading)).toBeVisible();
  });

  it("maps field errors returned by the handler onto the inputs", async () => {
    const onSubmit = resolvesTo({
      status: "field_errors",
      fieldErrors: { email: "We do not recognise this address." },
    });
    const { user, email, password, submit } = setup(onSubmit);

    await user.type(email, "ghost@example.com");
    await user.type(password, "secret123");
    await user.click(submit);

    expect(
      await screen.findByText("We do not recognise this address."),
    ).toBeVisible();
  });

  it("disables the button and announces progress while the request is in flight", async () => {
    let release: (() => void) | undefined;
    const onSubmit: SubmitLogin = vi.fn(
      () =>
        new Promise<LoginOutcome>((resolve) => {
          release = () => {
            resolve({ status: "success" });
          };
        }),
    );
    const { user, email, password, submit } = setup(onSubmit);

    await user.type(email, "manager@example.com");
    await user.type(password, "secret123");
    await user.click(submit);

    const pending = await screen.findByRole("button", { name: /signing in/i });
    expect(pending).toBeDisabled();

    release?.();
    expect(await screen.findByText("You are signed in")).toBeVisible();
  });

  it("toggles password visibility from the field control", async () => {
    const onSubmit = resolvesTo({ status: "success" });
    const { user, password } = setup(onSubmit);

    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("moves through the controls in a predictable tab order and submits on Enter", async () => {
    const onSubmit = resolvesTo({ status: "success" });
    const { user, email, password } = setup(onSubmit);

    // The email field takes focus on mount.
    expect(email).toHaveFocus();
    await user.tab();
    expect(password).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveFocus();

    await user.type(email, "manager@example.com");
    await user.type(password, "secret123{Enter}");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
