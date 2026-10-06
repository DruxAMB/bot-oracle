"use client";

import { useId, useState, type ReactNode } from "react";

// Controlled accordion: heading wraps a full-row button (APG pattern -
// keeps heading semantics, unlike <details> which can't animate). The
// panel reuses .manual-expand (grid-rows 0fr->1fr) so open AND close
// both transition; inert keeps hidden content out of tab order.
export default function Disclosure({
  headingId,
  heading,
  meta,
  children,
}: {
  headingId: string;
  heading: ReactNode;
  meta: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <h2 className="text-sm font-medium">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full flex-wrap items-baseline justify-between gap-2 p-5 pb-2 text-left select-none cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span
            id={headingId}
            className="flex items-center gap-1.5 font-medium text-foreground"
          >
            <span
              aria-hidden
              className={`inline-block text-steel transition-transform ${open ? "rotate-90" : ""}`}
            >
              ›
            </span>
            {heading}
          </span>
          <span className="text-xs font-normal text-muted-foreground">{meta}</span>
        </button>
      </h2>
      <div
        id={panelId}
        className="manual-expand"
        data-open={open ? "" : undefined}
        inert={!open}
      >
        <div className="manual-inner">
          <div className="manual-body">{children}</div>
        </div>
      </div>
    </>
  );
}
