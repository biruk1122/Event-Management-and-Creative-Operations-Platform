export default function Loading() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <div className="bg-muted h-8 w-36 animate-pulse rounded" />
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
