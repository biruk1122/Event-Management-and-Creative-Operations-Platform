export const ANALYTICS_SCOPE_LABEL =
  "Per-measure server-authorized scope; department grants may limit results to your current department";

/** Public context can render before hydration; grants and metrics stay gated. */
export function AnalyticsHeading({ scopeLabel }: { scopeLabel: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">Work delivery analytics</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Scope: {scopeLabel}. Each measure requires its own scoped grant.
      </p>
    </div>
  );
}
