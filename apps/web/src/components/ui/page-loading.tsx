/**
 * Shows the page frame while a workspace route's server check and data load.
 * Matches the markup of the route `loading.tsx` files so the first paint is
 * a heading and a status message rather than a blank page.
 */
export function PageLoading({ title }: { title: string }) {
  return (
    <main aria-busy="true" className="@container mx-auto max-w-352 px-4 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p role="status" className="mt-4">
        Loading {title.toLowerCase()}…
      </p>
    </main>
  );
}
