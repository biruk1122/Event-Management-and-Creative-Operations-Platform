export default function Loading() {
  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <div
        role="status"
        aria-label="Loading direct messages"
        className="space-y-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-muted h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    </main>
  );
}
