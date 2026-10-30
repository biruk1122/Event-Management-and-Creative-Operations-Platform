export default function Loading() {
  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <div className="bg-muted h-6 w-48 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-4 w-96 animate-pulse rounded" />

      <div
        role="status"
        aria-label="Loading Marketing workspace"
        className="mt-6 space-y-3"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-muted h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    </main>
  );
}
