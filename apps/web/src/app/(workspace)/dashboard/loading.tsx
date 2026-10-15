export default function LoadingDashboard() {
  return (
    <main aria-busy="true" className="@container mx-auto max-w-352 px-4 py-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p role="status" className="mt-4">
        Checking access and loading dashboard…
      </p>
    </main>
  );
}
