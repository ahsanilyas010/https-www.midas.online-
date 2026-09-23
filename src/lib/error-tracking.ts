import "server-only";

// Phase 8 — "Error tracking." No monitoring account (Sentry or otherwise)
// exists for this build — same category of external dependency as the
// TPS/CTPS/DNC bureau accounts, not something to provision speculatively.
// What's real today: structured logging to stderr, which Vercel (and most
// hosts) already ingest into their own log pipeline and can forward to a
// monitoring provider via that platform's own integration — no code change
// needed on this end to start doing that once a host is chosen.
//
// The extension point for a real APM/error-tracking SDK (Sentry, etc.) is
// here: once a DSN exists, install the SDK, wire its Next.js instrumentation
// per its own docs, and forward to it from the `captureException` call
// below instead of (or in addition to) the console log.
export function captureException(error: unknown, context?: Record<string, unknown>) {
  const payload = {
    level: "error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}
