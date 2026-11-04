export default function Loading() {
  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div className="bg-muted h-4 w-24 animate-pulse rounded" />
      <div className="bg-muted mt-4 h-6 w-48 animate-pulse rounded" />

      <div
        role="status"
        aria-label="Loading talent profile"
        className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
      >
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="bg-muted h-12 animate-pulse rounded-xl"
            />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="bg-muted h-24 animate-pulse rounded-xl"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
