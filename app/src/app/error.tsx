"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen bg-surface text-zinc-200 font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-white mb-2">Dashboard failed to render</h1>
        <p className="text-sm text-zinc-500 mb-6">
          The page itself errored — likely a transient RPC or render failure. Chain data is unaffected.
        </p>
        <button
          onClick={reset}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
