export const ANALYTICS_SCOPE_LABEL =
  "Per-measure server-authorized scope; department grants may limit results to your current department";

/** Public context can render before hydration; grants and metrics stay gated. */
export function AnalyticsHeading({ scopeLabel }: { scopeLabel: string }) {
  return (
    <div className="from-accent to-card rounded-2xl border bg-linear-to-br p-5 sm:p-6">
      <h2 className="text-2xl font-semibold tracking-tight">
        Work delivery analytics
      </h2>
      <p className="text-muted-foreground mt-3 max-w-3xl text-sm leading-relaxed">
        Scope: {scopeLabel}. Each measure requires its own scoped grant.
      </p>
    </div>
  );
}
