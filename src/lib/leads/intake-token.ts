import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Per-workspace inbound lead webhook token. Only the SHA-256 hash is ever
// stored (lead_intake_tokens.token_hash); the plaintext is shown once, when
// a manager generates or rotates it.
export const INTAKE_TOKEN_PREFIX = "lci_";

export function generateIntakeToken(): { token: string; hash: string; prefix: string } {
  const token = INTAKE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashIntakeToken(token), prefix: token.slice(0, 10) };
}

export function hashIntakeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
