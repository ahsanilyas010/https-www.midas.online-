"use client";

import { useEffect } from "react";

// Catches errors in the root layout itself, where the regular error.tsx
// boundary can't help since it renders inside that same layout. Has to
// supply its own <html>/<body> — this replaces the whole tree.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Something went wrong</h2>
        <p style={{ maxWidth: "24rem", fontSize: "0.75rem", color: "#6B7482" }}>
          The error has been logged. Reload the page to continue.
        </p>
        <button
          onClick={reset}
          style={{
            fontSize: "0.75rem",
            padding: "0.375rem 0.75rem",
            borderRadius: "0.375rem",
            background: "#064288",
            color: "white",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
