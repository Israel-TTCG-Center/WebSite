import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEYLEN = 64;

/**
 * Checks whether a stored verifier string is already in salted `scrypt$<saltHex>$<hashHex>` format.
 */
export function isScryptHash(value?: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  const parts = value.split("$");
  return (
    parts.length === 3 &&
    parts[0] === SCRYPT_PREFIX &&
    /^[0-9a-f]{32,}$/i.test(parts[1]) &&
    /^[0-9a-f]{128}$/i.test(parts[2])
  );
}

/**
 * Derives a salted cryptographic hash using Node's FIPS-validated `scryptSync`
 * with a unique 16-byte random salt per credential (`scrypt$<saltHex>$<keyHex>`).
 * Plaintext passwords are never stored in the database.
 */
export function hashPasswordScrypt(plainPassword: string): string {
  const saltHex = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(plainPassword, saltHex, SCRYPT_KEYLEN);
  return `${SCRYPT_PREFIX}$${saltHex}$${derivedKey.toString("hex")}`;
}

/**
 * Verifies a password against a stored `scrypt$<saltHex>$<keyHex>` verifier using
 * constant-time `timingSafeEqual` (with transparent fallback for pre-migration legacy
 * records so existing DB documents can be upgraded on sign-in without data loss).
 */
export function verifyPasswordScrypt(
  plainPassword: string,
  storedVerifier?: string | null
): boolean {
  if (!plainPassword || !storedVerifier) return false;

  if (isScryptHash(storedVerifier)) {
    const [, saltHex, keyHex] = storedVerifier.split("$");
    const expectedBuf = Buffer.from(keyHex, "hex");
    const actualBuf = scryptSync(plainPassword, saltHex, expectedBuf.length);
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  // Transparent fallback for pre-migration legacy records before automatic upgrade
  const a = Buffer.from(String(plainPassword), "utf8");
  const b = Buffer.from(String(storedVerifier), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
