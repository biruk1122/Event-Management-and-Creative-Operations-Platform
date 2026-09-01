export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-5 py-10 sm:px-8"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="bg-muted h-9 w-48 animate-pulse rounded-xl" />
      <div className="mt-16 space-y-4">
        <div className="bg-muted h-5 w-40 animate-pulse rounded-md" />
        <div className="bg-muted h-12 max-w-2xl animate-pulse rounded-xl" />
        <div className="bg-muted h-6 max-w-xl animate-pulse rounded-lg" />
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="border-border bg-card h-48 animate-pulse rounded-2xl border"
          />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </main>
  );
}
