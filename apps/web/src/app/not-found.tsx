import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-12">
      <section className="border-border bg-card w-full max-w-lg rounded-2xl border p-7 text-center shadow-sm">
        <span className="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-xl">
          <FileQuestion aria-hidden="true" className="size-5" />
        </span>
        <p className="text-primary mt-5 text-sm font-semibold">404</p>
        <h1 className="mt-1 text-xl font-semibold">This view does not exist</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Return to the foundation workspace and continue from there.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">
            <ArrowLeft data-icon="inline-start" />
            Return home
          </Link>
        </Button>
      </section>
    </main>
  );
}
