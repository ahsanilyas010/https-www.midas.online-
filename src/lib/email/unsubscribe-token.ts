import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Signed unsubscribe links — anyone with the link can unsubscribe that one
// address (by design, one-click), but can't unsubscribe an address they
// don't already have a link for.
function secret(): string {
  // Demo build falls back to a fixed secret so unsubscribe links still work.
  return process.env.UNSUBSCRIBE_SECRET || "midas-demo-unsubscribe-secret";
}

export function signUnsubscribeToken(email: string): string {
  return createHmac("sha256", secret()).update(email.toLowerCase()).digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = signUnsubscribeToken(email);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
