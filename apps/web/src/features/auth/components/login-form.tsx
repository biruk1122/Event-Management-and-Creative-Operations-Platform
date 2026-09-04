"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { submitLogin as defaultSubmitLogin } from "../api/submit-login";
import type { SubmitLogin } from "../lib/login-outcome";
import { loginSchema, type LoginValues } from "../lib/login-schema";

const FORM_ERRORS: Record<
  "invalid_credentials" | "account_locked" | "rate_limited" | "unexpected",
  { title: string; description: string }
> = {
  invalid_credentials: {
    title: "Your email or password is incorrect",
    description: "Check the details and try again.",
  },
  account_locked: {
    title: "This account is temporarily locked",
    description:
      "There have been too many failed attempts. Wait a few minutes, then try again or contact an administrator.",
  },
  rate_limited: {
    title: "Too many attempts",
    description: "Wait a moment before trying to sign in again.",
  },
  unexpected: {
    title: "Something went wrong",
    description: "We could not sign you in just now. Please try again.",
  },
};

interface LoginFormProps {
  /** Injected by the route; tests pass a stub. Defaults to the placeholder. */
  onSubmit?: SubmitLogin;
  /** Where the user was heading before being sent to sign in. */
  redirectTo?: string;
}

export function LoginForm({ onSubmit, redirectTo }: LoginFormProps) {
  const submit = onSubmit ?? defaultSubmitLogin;

  const emailErrorId = useId();
  const passwordErrorId = useId();

  const [formErrorKey, setFormErrorKey] = useState<
    keyof typeof FORM_ERRORS | null
  >(null);
  const [succeeded, setSucceeded] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function run(values: LoginValues) {
    setFormErrorKey(null);
    const outcome = await submit(values);

    switch (outcome.status) {
      case "success":
        setSucceeded(true);
        return;
      case "field_errors":
        for (const [field, message] of Object.entries(outcome.fieldErrors)) {
          if (message) {
            setError(field as keyof LoginValues, { message });
          }
        }
        return;
      default:
        setFormErrorKey(outcome.status);
    }
  }

  if (succeeded) {
    return (
      <Alert role="status" aria-live="polite">
        <AlertTitle>You are signed in</AlertTitle>
        <AlertDescription>
          {redirectTo
            ? "Taking you back to where you left off…"
            : "Taking you to your dashboard…"}
        </AlertDescription>
      </Alert>
    );
  }

  const formError = formErrorKey ? FORM_ERRORS[formErrorKey] : null;

  return (
    <form
      noValidate
      aria-label="Sign in"
      className="space-y-5"
      onSubmit={(event) => void handleSubmit(run)(event)}
    >
      {formError ? (
        <Alert variant="destructive" aria-live="assertive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{formError.title}</AlertTitle>
          <AlertDescription>{formError.description}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? emailErrorId : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id={emailErrorId} className="text-destructive text-sm">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <div className="relative">
          <Input
            id="login-password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            className="pr-10"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? passwordErrorId : undefined}
            {...register("password")}
          />
          <button
            type="button"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg focus-visible:ring-3 focus-visible:outline-none"
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {errors.password ? (
          <p id={passwordErrorId} className="text-destructive text-sm">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            Signing in{"…"}
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
