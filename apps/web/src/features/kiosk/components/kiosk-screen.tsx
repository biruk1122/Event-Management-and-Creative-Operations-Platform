"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  checkActivation,
  punch,
  searchEmployees,
  verifyEmployee,
} from "../api/kiosk-gateway";
import {
  clearKioskCredentials,
  readKioskCredentials,
  storeKioskCredentials,
} from "../api/kiosk-client";
import type { KioskEmployeeOption } from "../lib/kiosk-outcome";

type Stage =
  | { name: "checking" }
  | { name: "activation" }
  | { name: "select" }
  | { name: "password"; employee: KioskEmployeeOption }
  | {
      name: "punch";
      employee: KioskEmployeeOption;
      sessionToken: string;
      hasOpenSession: boolean;
    }
  | { name: "result"; message: string; ok: boolean };

const RESET_DELAY_MS = 4000;
const SEARCH_DEBOUNCE_MS = 300;

function newClientRequestId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** A shared office tablet's own attendance screen - intentionally outside
 * the normal authenticated app shell (no sidebar, no signed-in user). The
 * device proves its own identity with a long-lived bearer secret; the
 * employee proves theirs with their real account password, never a PIN
 * alone. Every state resets to employee selection after a short delay so
 * the previous employee's name never lingers on a shared screen. */
export function KioskScreen() {
  // Computed synchronously from storage at mount - never set inside an
  // effect body, so only the genuinely async activation re-check below
  // needs one.
  const [stage, setStage] = useState<Stage>(() =>
    readKioskCredentials() ? { name: "checking" } : { name: "activation" },
  );
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<KioskEmployeeOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kioskIdInput, setKioskIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [kioskNameInput, setKioskNameInput] = useState("");
  const passwordId = useId();
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbort = useRef<AbortController | null>(null);

  const runSearch = useCallback((value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
    searchTimer.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbort.current = controller;
      void searchEmployees(value, controller.signal)
        .then(setOptions)
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const enterSelectStage = useCallback(() => {
    setStage({ name: "select" });
    setSearching(true);
    runSearch("");
  }, [runSearch]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setSearching(true);
    runSearch(value);
  }

  useEffect(() => {
    if (stage.name !== "checking") return;
    let cancelled = false;
    void checkActivation().then((outcome) => {
      if (cancelled) return;
      if (outcome.status === "valid") {
        enterSelectStage();
      } else if (outcome.status === "invalid") {
        clearKioskCredentials();
        setStage({ name: "activation" });
      } else {
        setError(
          "Could not reach the server. Check the connection and reload.",
        );
        enterSelectStage();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stage.name, enterSelectStage]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchAbort.current?.abort();
    };
  }, []);

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setSearch("");
      setPassword("");
      setError(null);
      enterSelectStage();
    }, RESET_DELAY_MS);
  }

  async function handleActivate() {
    const kioskId = kioskIdInput.trim();
    const token = tokenInput.trim();
    const kioskName = kioskNameInput.trim();
    if (!kioskId || !token || !kioskName) {
      setError("Enter the kiosk ID, bearer token, and a name for this device.");
      return;
    }
    storeKioskCredentials({ kioskId, token, kioskName });
    setBusy(true);
    const outcome = await checkActivation();
    setBusy(false);
    if (outcome.status === "valid") {
      setError(null);
      enterSelectStage();
      return;
    }
    clearKioskCredentials();
    setError(
      outcome.status === "invalid"
        ? "That kiosk ID or token was not accepted. Double-check both values."
        : "Could not reach the server. Check the connection and try again.",
    );
  }

  function selectEmployee(employee: KioskEmployeeOption) {
    setPassword("");
    setError(null);
    setStage({ name: "password", employee });
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (stage.name !== "password") return;
    if (!password) {
      setError("Enter the account password.");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await verifyEmployee(stage.employee.id, password);
    setBusy(false);
    if (outcome.status === "success") {
      setStage({
        name: "punch",
        employee: stage.employee,
        sessionToken: outcome.result.sessionToken,
        hasOpenSession: outcome.result.hasOpenSession,
      });
      return;
    }
    setPassword("");
    if (outcome.status === "employee_not_found") {
      setError("That employee is no longer active. Returning to the start.");
      scheduleReset();
      return;
    }
    if (outcome.status === "kiosk_invalid") {
      clearKioskCredentials();
      setStage({ name: "activation" });
      setError("This device is no longer registered. Activate it again.");
      return;
    }
    setError(
      outcome.status === "invalid_credentials"
        ? "That password does not match this account."
        : outcome.status === "account_locked"
          ? "This account is temporarily locked after too many failed attempts."
          : outcome.status === "account_inactive"
            ? "This employee's account is not active."
            : "Something went wrong. Try again.",
    );
  }

  async function handlePunch(punchType: "CHECK_IN" | "CHECK_OUT") {
    if (stage.name !== "punch") return;
    setBusy(true);
    const outcome = await punch(
      stage.sessionToken,
      punchType,
      newClientRequestId(),
    );
    setBusy(false);
    if (outcome.status === "success") {
      setStage({ name: "result", message: outcome.result.message, ok: true });
      scheduleReset();
      return;
    }
    if (outcome.status === "kiosk_invalid") {
      clearKioskCredentials();
      setStage({ name: "activation" });
      setError("This device is no longer registered. Activate it again.");
      return;
    }
    const message =
      outcome.status === "session_expired"
        ? "Verification expired. Select the employee again."
        : outcome.status === "already_checked_in"
          ? "Already checked in."
          : outcome.status === "no_open_session"
            ? "There is no open check-in to check out of."
            : "Something went wrong. Try again.";
    setStage({ name: "result", message, ok: false });
    scheduleReset();
  }

  if (stage.name === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p role="status">Starting up…</p>
      </div>
    );
  }

  if (stage.name === "activation") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border p-6">
          <h1 className="text-xl font-semibold">Activate this kiosk</h1>
          <p className="text-muted-foreground text-sm">
            Enter the kiosk ID and bearer token shown when this device was
            registered under Attendance → Kiosks.
          </p>
          {error ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="kiosk-name">Device name</Label>
            <Input
              id="kiosk-name"
              value={kioskNameInput}
              onChange={(event) => setKioskNameInput(event.target.value)}
              placeholder="Front desk tablet"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kiosk-id">Kiosk ID</Label>
            <Input
              id="kiosk-id"
              value={kioskIdInput}
              onChange={(event) => setKioskIdInput(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kiosk-token">Bearer token</Label>
            <Input
              id="kiosk-token"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void handleActivate()}
          >
            {busy ? "Activating…" : "Activate"}
          </Button>
        </div>
      </div>
    );
  }

  if (stage.name === "result") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div
          role="status"
          className={`w-full max-w-md space-y-2 rounded-2xl border p-8 text-center ${
            stage.ok ? "border-green-600" : "border-destructive"
          }`}
        >
          <p className="text-2xl font-semibold">{stage.ok ? "✓" : "✕"}</p>
          <p className="text-lg">{stage.message}</p>
        </div>
      </div>
    );
  }

  if (stage.name === "password") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <form
          className="w-full max-w-md space-y-4 rounded-2xl border p-6"
          onSubmit={(event) => void handleVerify(event)}
        >
          <h1 className="text-xl font-semibold">{stage.employee.name}</h1>
          <p className="text-muted-foreground text-sm">
            Enter your account password to continue.
          </p>
          {error ? (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={passwordId}>Password</Label>
            <Input
              id={passwordId}
              type="password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => enterSelectStage()}
            >
              Not you?
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Checking…" : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (stage.name === "punch") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border p-6 text-center">
          <h1 className="text-xl font-semibold">{stage.employee.name}</h1>
          <p className="text-muted-foreground text-sm">
            {stage.hasOpenSession
              ? "You're currently checked in."
              : "You're currently checked out."}
          </p>
          <Button
            className="h-16 w-full text-lg"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              void handlePunch(stage.hasOpenSession ? "CHECK_OUT" : "CHECK_IN")
            }
          >
            {busy
              ? "Recording…"
              : stage.hasOpenSession
                ? "Check out"
                : "Check in"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-center text-xl font-semibold">Find your name</h1>
        {error ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
        <Label htmlFor="kiosk-search" className="sr-only">
          Search by name or employee code
        </Label>
        <Input
          id="kiosk-search"
          autoFocus
          placeholder="Type your name or employee code…"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
        <ul className="space-y-2">
          {searching ? (
            <li
              role="status"
              className="text-muted-foreground text-center text-sm"
            >
              Searching…
            </li>
          ) : options.length === 0 ? (
            <li className="text-muted-foreground text-center text-sm">
              {search ? "No matches." : "Start typing to find your name."}
            </li>
          ) : (
            options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="hover:bg-muted w-full rounded-lg border p-3 text-left text-lg"
                  onClick={() => selectEmployee(option)}
                >
                  {option.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
