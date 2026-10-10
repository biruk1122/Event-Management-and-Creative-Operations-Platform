export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="bg-muted h-4 w-24 animate-pulse rounded" />
      <div className="bg-muted mt-4 h-8 w-36 animate-pulse rounded" />
      <div
        role="status"
        aria-label="Loading reports"
        className="mt-6 space-y-3"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-muted h-16 animate-pulse rounded-xl" />
        ))}
      </div>
    </main>
  );
}
