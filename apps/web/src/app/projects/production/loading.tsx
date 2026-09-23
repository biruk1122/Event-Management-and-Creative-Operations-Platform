export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div
        role="status"
        aria-label="Loading production projects"
        className="space-y-4"
      >
        <div className="bg-muted h-7 w-56 animate-pulse rounded" />
        <div className="bg-muted h-10 w-full animate-pulse rounded" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="bg-muted h-28 animate-pulse rounded-xl"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
