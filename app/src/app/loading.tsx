// Skeleton mirrors the dashboard layout so streamed content lands without shift.
export default function Loading() {
  return (
    <main className="min-h-screen bg-surface text-foreground font-sans animate-pulse">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="h-7 w-32 rounded bg-elevated" />
            <div className="mt-2 h-4 w-64 rounded bg-card" />
          </div>
          <div className="h-6 w-36 rounded-full bg-card" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="h-3 w-20 rounded bg-elevated mb-2" />
              <div className="h-6 w-12 rounded bg-elevated" />
            </div>
          ))}
        </div>
        <div className="h-36 rounded-lg border border-border bg-card mb-8" />
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="h-40 rounded-lg border border-border bg-card" />
          <div className="h-40 rounded-lg border border-border bg-card" />
        </div>
        <div className="h-64 rounded-lg border border-border bg-card" />
      </div>
    </main>
  );
}
