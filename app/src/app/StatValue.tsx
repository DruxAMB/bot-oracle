"use client";

import { useEffect, useRef, useState } from "react";

// "0.0400 BOT" -> { n: 0.04, decimals: 4, suffix: " BOT" } so the numeric
// part can tween while formatting (decimals + suffix) is preserved.
function parseNum(v: string) {
  const m = v.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  return {
    n: parseFloat(m[1]),
    decimals: (m[1].split(".")[1] ?? "").length,
    suffix: m[2],
  };
}

// Two behaviors:
// - mount: numeric values count up from 0 (delay staggers the tile row);
//   non-numeric values get the CSS fade+rise instead.
// - update: odometer roll - old value slides up out, new one rises from
//   below via the two-cell track.
export default function StatValue({
  value,
  delay = 0,
}: {
  value: string;
  delay?: number;
}) {
  const [curr, setCurr] = useState(value);
  const [prev, setPrev] = useState<string | null>(null);
  const target = parseNum(value);
  const [intro, setIntro] = useState<string | null>(
    target ? `${(0).toFixed(target.decimals)}${target.suffix}` : null
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // entrance count-up, mount only
  useEffect(() => {
    if (!target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntro(null);
      return;
    }
    const dur = 750;
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = 1 - Math.pow(1 - p, 3);
      setIntro(`${(target.n * e).toFixed(target.decimals)}${target.suffix}`);
      if (p < 1) raf = requestAnimationFrame(step);
      else setIntro(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // roll on change
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

  const rolling = prev !== null;
  return (
    <span
      className="stat-roll stat-fade"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="stat-roll-track" data-rolling={rolling ? "" : undefined}>
        <span className="stat-roll-cell">
          {rolling ? prev : (intro ?? curr)}
        </span>
        {rolling && <span className="stat-roll-cell">{curr}</span>}
      </span>
    </span>
  );
}
