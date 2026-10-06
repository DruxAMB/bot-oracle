"use client";

import { useEffect, useRef, useState } from "react";

// Odometer-style swap: when the value changes, the old value slides up
// and out while the new value rises from below. The track holds
// [prev, curr]; translating it up by one cell performs the roll. When
// prev clears, the DOM is already showing curr - transition is only
// applied while data-rolling, so cleanup snaps invisibly.
export default function StatValue({ value }: { value: string }) {
  const [curr, setCurr] = useState(value);
  const [prev, setPrev] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value === curr) return;
    setPrev(curr);
    setCurr(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPrev(null), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <span className="stat-roll">
      <span className="stat-roll-track" data-rolling={prev !== null ? "" : undefined}>
        <span className="stat-roll-cell">{prev ?? curr}</span>
        {prev !== null && <span className="stat-roll-cell">{curr}</span>}
      </span>
    </span>
  );
}
