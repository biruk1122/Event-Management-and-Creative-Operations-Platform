import { Users } from "lucide-react";

/** The banner at the top of the talent directory. Server-rendered; it has no state. */
export function TalentPageHero({ description }: { description: string }) {
  return (
    <header className="border-border from-primary/15 via-primary/5 to-card relative overflow-hidden rounded-2xl border bg-linear-to-r p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <span className="bg-primary text-primary-foreground inline-flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm">
          <Users aria-hidden="true" className="size-7" />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Talent</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </header>
  );
}
