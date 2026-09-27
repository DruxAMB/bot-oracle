"use client";

import { useEffect, useRef } from "react";

// Shared accessible modal shell: Escape closes, backdrop click closes,
// focus moves into the dialog on open and returns on close, body scroll
// is locked while open.
export default function Dialog({
  onClose,
  labelId,
  wide = false,
  children,
}: {
  onClose: () => void;
  labelId: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog responds — prevents one Escape from
      // closing stacked modals at once.
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] === ref.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/70" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} rounded-t-xl sm:rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl outline-none max-h-[90vh] overflow-y-auto`}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  id,
  title,
  onClose,
}: {
  id: string;
  title: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 id={id} className="text-sm font-medium text-sky-300">
        {title}
      </h2>
      <button
        onClick={onClose}
        aria-label="Close dialog"
        className="rounded p-1 text-zinc-500 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
    </div>
  );
}
