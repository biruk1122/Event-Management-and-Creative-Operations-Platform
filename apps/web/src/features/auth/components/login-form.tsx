"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { SubmitLogin } from "../lib/login-outcome";
import { loginSchema, type LoginValues } from "../lib/login-schema";

const FORM_ERRORS: Record<
  | "invalid_credentials"
  | "account_locked"
  | "account_inactive"
  | "rate_limited"
  | "unexpected",
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
  account_inactive: {
    title: "This account is not active",
    description:
      "Ask an administrator to reactivate your account, then sign in again.",
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
  /** Runs the sign-in request and reports a mapped outcome. */
  onSubmit: SubmitLogin;
  /** Where the user was heading before being sent to sign in. */
  redirectTo?: string;
}

export function LoginForm({ onSubmit, redirectTo }: LoginFormProps) {
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);

  const [formErrorKey, setFormErrorKey] = useState<
    keyof typeof FORM_ERRORS | null
  >(null);
  const [succeeded, setSucceeded] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  useEffect(() => {
    if (formErrorKey || succeeded) feedbackRef.current?.focus();
  }, [formErrorKey, succeeded]);

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
    let outcome;
    try {
      outcome = await onSubmit(values);
    } catch {
      setFormErrorKey("unexpected");
      return;
    }

    switch (outcome.status) {
      case "success":
        setSucceeded(true);
        return;
      case "field_errors":
        let firstError = true;
        for (const [field, message] of Object.entries(outcome.fieldErrors)) {
          if (message) {
            setError(
              field as keyof LoginValues,
              { message },
              { shouldFocus: firstError },
            );
            firstError = false;
          }
        }
        return;
      default:
        setFormErrorKey(outcome.status);
    }
  }

  if (succeeded) {
    return (
      <Alert ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">
        <AlertTitle>You are signed in</AlertTitle>
        <AlertDescription>
          {redirectTo
            ? "Taking you back to where you left off…"
            : "Taking you to your workspace…"}
        </AlertDescription>
      </Alert>
    );
  }

  const formError = formErrorKey ? FORM_ERRORS[formErrorKey] : null;

  return (
    <form
      noValidate
      aria-label="Sign in"
      className="space-y-6"
      aria-busy={isSubmitting}
      onSubmit={(event) => void handleSubmit(run)(event)}
    >
      {formError ? (
        <Alert
          ref={feedbackRef}
          tabIndex={-1}
          variant="destructive"
          aria-live="assertive"
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{formError.title}</AlertTitle>
          <AlertDescription>{formError.description}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          />
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            className="h-12 pl-11 text-base"
            readOnly={isSubmitting}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? emailErrorId : undefined}
            {...register("email")}
          />
        </div>
        {errors.email ? (
          <p id={emailErrorId} className="text-destructive text-sm">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          />
          <Input
            id="login-password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            className="h-12 pr-12 pl-11 text-base"
            placeholder="Enter your password"
            readOnly={isSubmitting}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? passwordErrorId : undefined}
            {...register("password")}
          />
          <button
            type="button"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg focus-visible:ring-3 focus-visible:outline-none"
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
        className="h-12 w-full"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
            Signing in{"…"}
          </>
        ) : (
          <>
            Sign in <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
