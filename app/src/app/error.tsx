"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen bg-surface text-foreground font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-foreground mb-2">Dashboard failed to render</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page itself errored — likely a transient RPC or render failure. Chain data is unaffected.
        </p>
        <button
          onClick={reset}
          className="rounded-lg border border-border-strong bg-card px-4 py-2 text-sm text-foreground hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
