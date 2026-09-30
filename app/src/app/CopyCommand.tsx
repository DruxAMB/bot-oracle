"use client";

import { useRef, useState } from "react";

export default function CopyCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = cmd;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded bg-background border border-border px-3 py-2">
      <code className="overflow-x-auto whitespace-nowrap text-xs text-secondary">
        <span aria-hidden className="text-primary select-none">$ </span>
        {cmd}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
    </div>
  );
}
