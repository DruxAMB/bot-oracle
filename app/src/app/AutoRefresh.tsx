"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refetches server-rendered data on an interval WITHOUT remounting client
// components — unlike a meta refresh, wallet state and inputs survive.
export default function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
