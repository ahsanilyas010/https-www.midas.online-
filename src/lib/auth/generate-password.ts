import { randomBytes } from "crypto";

// Unambiguous alphabet — no O/0, l/1/I, since these get read aloud across a
// noisy floor. 14 characters, cryptographically random (spec section 3.1).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
