export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="bg-muted h-4 w-24 animate-pulse rounded" />
      <div className="bg-muted mt-4 h-6 w-32 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-4 w-80 animate-pulse rounded" />

      <div
        role="status"
        aria-label="Loading departments"
        className="mt-6 space-y-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-muted h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    </main>
  );
}
