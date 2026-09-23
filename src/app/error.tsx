"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Phase 8 — route-segment error boundary. Logs client-side (visible in
// the browser console today; see src/lib/error-tracking.ts for the
// server-side equivalent and the note on why there's no monitoring SDK
// wired up yet).
export default function ErrorBoundary({
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
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" />
      <h2 className="text-sm font-semibold text-ink">Something went wrong</h2>
      <p className="max-w-sm text-xs text-muted">
        The error has been logged. Try again, or reload the page if it keeps happening.
      </p>
      <Button size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
