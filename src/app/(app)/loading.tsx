// Shown while any page in the app is loading, so a click gives immediate feedback.
export default function AppLoading() {
  return (
    <div className="p-6" role="status" aria-label="Loading">
      <div className="mb-5 h-7 w-56 animate-pulse rounded-md bg-line" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-white" />
        ))}
      </div>
      <div className="mt-4 h-64 animate-pulse rounded-xl border border-line bg-white" />
    </div>
  );
}
