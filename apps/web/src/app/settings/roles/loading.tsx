export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="bg-muted h-6 w-56 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-4 w-72 animate-pulse rounded" />

      <div role="status" aria-label="Loading roles" className="mt-6 space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="bg-muted h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    </main>
  );
}
