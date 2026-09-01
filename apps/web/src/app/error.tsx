"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-12">
      <section className="border-border bg-card w-full max-w-lg rounded-2xl border p-7 text-center shadow-sm">
        <span className="bg-destructive/10 text-destructive mx-auto flex size-12 items-center justify-center rounded-xl">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">
          The workspace could not load
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          The problem has been contained. Try loading this view again.
        </p>
        <Button className="mt-6" onClick={reset}>
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
      </section>
    </main>
  );
}
