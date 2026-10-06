"use client";

import { useState } from "react";
import Dialog, { DialogHeader } from "./Dialog";
import Markdown from "./Markdown";

export default function ResultModal({
  requestId,
  result,
}: {
  requestId: string;
  result: string;
}) {
  const [open, setOpen] = useState(false);
  const labelId = `res-h-${requestId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        result
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelId={labelId} size="2xl">
        <DialogHeader id={labelId} title={`Request #${requestId} · result`} onClose={() => setOpen(false)} />
        <Markdown>{result}</Markdown>
      </Dialog>
    </>
  );
}
