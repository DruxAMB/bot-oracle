"use client";

import { Toaster as Sonner } from "sonner";

// Axiom-styled: flat carbon card, hairline border, 2px radius, mono.
export default function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-card)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: 2,
          color: "var(--color-foreground)",
          fontFamily: "inherit",
          boxShadow: "none",
        },
      }}
    />
  );
}
