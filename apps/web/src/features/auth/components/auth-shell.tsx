import type { ReactNode } from "react";
import { Layers3 } from "lucide-react";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Centered, responsive frame for the unauthenticated routes. It carries the
 * product mark and the page heading; the route supplies the interactive card
 * contents as children.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-10 sm:px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl shadow-sm">
            <Layers3 aria-hidden="true" className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            {description ? (
              <p className="text-muted-foreground text-sm leading-6 text-pretty">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-7">
          {children}
        </div>

        {footer ? (
          <div className="text-muted-foreground mt-6 text-center text-xs leading-5">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
