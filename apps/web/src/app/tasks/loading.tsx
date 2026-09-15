export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="bg-muted h-4 w-24 animate-pulse rounded" />
      <div className="bg-muted mt-6 h-7 w-20 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-4 w-96 max-w-full animate-pulse rounded" />
      <div
        role="status"
        aria-label="Loading tasks"
        className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-muted h-44 animate-pulse rounded-xl" />
        ))}
      </div>
    </main>
  );
}
