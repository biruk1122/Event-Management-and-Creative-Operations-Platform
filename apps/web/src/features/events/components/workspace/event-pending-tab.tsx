/** A workspace tab whose content arrives in a later phase. The tab and its URL
 * exist now so the workspace structure stays stable. */
export function EventPendingTab({ title }: { title: string }) {
  return (
    <section className="border-border bg-card rounded-2xl border p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm">
        This section is not available yet.
      </p>
    </section>
  );
}
