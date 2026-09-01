import {
  Blocks,
  Braces,
  Check,
  CircleDot,
  DatabaseZap,
  Layers3,
  LockKeyhole,
  RadioTower,
} from "lucide-react";

import { APP_NAME } from "@event-platform/shared";

const foundationLayers = [
  {
    description:
      "Next.js App Router, strict TypeScript, Tailwind CSS, and accessible shadcn/ui primitives.",
    icon: Blocks,
    title: "Interface system",
  },
  {
    description:
      "A typed API transport, validated environment boundaries, and server/client data providers.",
    icon: Braces,
    title: "Application boundaries",
  },
  {
    description:
      "Linting, type checks, unit tests, and production builds run from one workspace.",
    icon: LockKeyhole,
    title: "Quality baseline",
  },
] as const;

const futureConnections = [
  { icon: RadioTower, label: "NestJS API", phase: "Phase 4" },
  { icon: DatabaseZap, label: "PostgreSQL", phase: "Phase 5" },
  { icon: Layers3, label: "Docker environment", phase: "Phase 6" },
] as const;

export function FoundationOverview() {
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_58%)]"
      />

      <header className="border-border/80 bg-background/85 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
              <Layers3 aria-hidden="true" className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Nexo Operations</p>
              <p className="text-muted-foreground truncate text-xs">
                Foundation workspace
              </p>
            </div>
          </div>

          <div className="border-border bg-card flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-xs">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="bg-primary/35 absolute inline-flex size-full animate-ping rounded-full" />
              <span className="bg-primary relative inline-flex size-2 rounded-full" />
            </span>
            Phase 3
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14 lg:py-18">
        <section className="max-w-3xl" aria-labelledby="foundation-heading">
          <div className="text-primary mb-5 flex items-center gap-2 text-sm font-semibold">
            <CircleDot aria-hidden="true" className="size-4" />
            Frontend foundation ready
          </div>
          <h1
            id="foundation-heading"
            className="text-foreground max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-5xl"
          >
            A dependable surface for the work that comes next.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-2xl text-base leading-7 text-pretty sm:text-lg sm:leading-8">
            {APP_NAME} now has a responsive, accessible frontend baseline.
            Business modules remain intentionally untouched until foundation
            planning is complete.
          </p>
        </section>

        <section
          className="mt-10 grid gap-4 md:grid-cols-3"
          aria-label="Frontend foundation layers"
        >
          {foundationLayers.map(({ description, icon: Icon, title }) => (
            <article
              key={title}
              className="border-border/90 bg-card/90 rounded-2xl border p-5 shadow-[0_14px_45px_-32px_color-mix(in_oklab,var(--foreground)_40%,transparent)]"
            >
              <span className="bg-accent text-accent-foreground mb-5 flex size-10 items-center justify-center rounded-xl">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {description}
              </p>
            </article>
          ))}
        </section>

        <section className="border-border/80 bg-card/70 mt-6 rounded-2xl border p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">Next foundation connections</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                These services will connect in their separately approved phases.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {futureConnections.map(({ icon: Icon, label, phase }) => (
                <span
                  key={label}
                  className="border-border bg-background text-muted-foreground inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
                >
                  <Icon aria-hidden="true" className="text-primary size-3.5" />
                  {label}
                  <span className="sr-only">planned for</span>
                  <span className="text-foreground">· {phase}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <footer className="text-muted-foreground mt-auto flex items-center gap-2 pt-10 text-xs">
          <Check aria-hidden="true" className="text-primary size-3.5" />
          No business features are implemented in this phase.
        </footer>
      </div>
    </main>
  );
}
