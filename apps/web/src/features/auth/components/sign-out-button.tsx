"use client";

import { useRef, useState } from "react";
import { LoaderCircle, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import styles from "./sign-out-button.module.css";

interface SignOutButtonProps {
  /** Revokes the session; the caller handles navigation afterwards. */
  onSignOut: () => Promise<void>;
}

export function SignOutButton({ onSignOut }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);

  async function confirmSignOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      await onSignOut();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy.current) {
          setOpen(value);
          setError(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </DialogTrigger>
      <DialogContent
        className={styles.modal}
        showCloseButton={!pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy.current) event.preventDefault();
        }}
      >
        <div className={styles.body}>
          <div className={styles.icon}>
            <LogOut aria-hidden="true" strokeWidth={1.75} />
            <span aria-hidden="true" className={styles.rays}>
              <i />
              <i />
              <i />
            </span>
          </div>
          <DialogHeader className={styles.heading}>
            <DialogTitle className={styles.title}>
              Ready to sign out?
            </DialogTitle>
            <DialogDescription className={styles.description}>
              You’re about to leave your Lela workspace. You can sign back in
              whenever you’re ready.
            </DialogDescription>
          </DialogHeader>
          <p className={styles.session}>
            <ShieldCheck aria-hidden="true" />
            <span>This will end your current session.</span>
          </p>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              Sign-out could not be confirmed. Please try again.
            </p>
          ) : null}
        </div>
        <DialogFooter className={styles.footer}>
          <Button
            ref={cancel}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
            className={styles.cancel}
          >
            Stay signed in
          </Button>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void confirmSignOut()}
            className={styles.confirm}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {pending ? "Signing out…" : "Yes, sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
