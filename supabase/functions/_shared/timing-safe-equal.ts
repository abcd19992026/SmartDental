/** Constant-time string comparison for secrets (cron header, webhook verify token, HMAC
 * signatures). A plain `===` short-circuits on the first differing byte, which leaks how many
 * leading characters were correct via response timing -- irrelevant for most app code, but these
 * call sites are comparing against secrets an attacker controls one guess at a time. Mismatched
 * lengths return false immediately: this leaks length, not content, which is the same tradeoff
 * Node's own `crypto.timingSafeEqual` makes (it throws on length mismatch rather than compare). */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
