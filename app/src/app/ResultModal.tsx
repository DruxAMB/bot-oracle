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
        className="mt-1 text-xs text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        result
      </button>
      {open && (
        <Dialog onClose={() => setOpen(false)} labelId={labelId} wide>
          <DialogHeader id={labelId} title={`Request #${requestId} — result`} onClose={() => setOpen(false)} />
          <Markdown>{result}</Markdown>
        </Dialog>
      )}
    </>
  );
}
