// Cryptographically secure temporary password generation -- always server-side, never in the
// browser. Excludes visually-ambiguous characters (0/O, 1/l/I) since these are read off a
// screen and handed to a clinic owner over the phone/in person.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function randomChar(charset: string): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return charset[bytes[0] % charset.length];
}

/** 16 chars, guaranteed at least one lowercase, uppercase, digit, and symbol. */
export function generateTempPassword(length = 16): string {
  const required = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => randomChar(ALL));
  const combined = [...required, ...rest];

  // Fisher-Yates shuffle with crypto randomness so the guaranteed-category chars aren't always
  // in the same first four positions.
  for (let i = combined.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join("");
}
