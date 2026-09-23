import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Signed unsubscribe links — anyone with the link can unsubscribe that one
// address (by design, one-click), but can't unsubscribe an address they
// don't already have a link for.
function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error("UNSUBSCRIBE_SECRET is not set");
  return s;
}

export function signUnsubscribeToken(email: string): string {
  return createHmac("sha256", secret()).update(email.toLowerCase()).digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!process.env.UNSUBSCRIBE_SECRET) return false;
  const expected = signUnsubscribeToken(email);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
