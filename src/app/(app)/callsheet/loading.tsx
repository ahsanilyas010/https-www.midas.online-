// Skeleton shaped like the board so the page doesn't jump when it arrives.
export default function CallSheetLoading() {
  return (
    <div className="p-8" aria-busy="true" aria-label="Loading the call sheet">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-line" />
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
        {[0, 1, 2].map((c) => (
          <div key={c} className="flex flex-col gap-3">
            <div className="h-6 w-2/3 animate-pulse rounded bg-line" />
            {[0, 1, 2].map((r) => (
              <div key={r} className="h-40 animate-pulse rounded-lg border border-line bg-white" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
