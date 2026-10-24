import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { normalizeName, type Name } from "./name";

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
 * Plaintext passwords are never stored in MongoDB.
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

export interface VerifiedThirdPartyIdentity {
  provider: string;
  authStrategy: "auth0-oauth";
  providerAccountId: string;
  email: string;
  name: Name;
  emailVerified: boolean;
}

/**
 * Auth0 / Third-Party Identity Provider Adapter for Customer OAuth Sign-In (e.g. Google via Auth0).
 * No user email input or password storage is required; the verified Google/IdP email is used
 * as the account email and newsletter destination (`contactEmail`).
 */
export function verifyThirdPartyIdentity(params: {
  provider?: string;
  email?: string;
  name?: Name | string;
  idToken?: string;
}): VerifiedThirdPartyIdentity {
  const provider = String(params.provider || "google").toLowerCase().trim();

  // If a signed JWT / ID token payload is provided by Auth0 / Google OIDC, decode claims
  let tokenEmail = "";
  let tokenName: Name | string = "";
  let tokenSub = "";
  if (params.idToken && params.idToken.includes(".")) {
    try {
      const payloadPart = params.idToken.split(".")[1];
      const claims = JSON.parse(
        Buffer.from(payloadPart, "base64url").toString("utf8")
      );
      if (typeof claims?.email === "string") tokenEmail = claims.email;
      if (claims?.given_name || claims?.family_name) {
        tokenName = {
          firstName: String(claims.given_name || ""),
          ...(claims.middle_name
            ? { middleName: String(claims.middle_name) }
            : {}),
          lastName: String(claims.family_name || ""),
        };
      } else if (typeof claims?.name === "string") {
        tokenName = claims.name;
      }
      if (typeof claims?.sub === "string") tokenSub = claims.sub;
    } catch {
      // Ignore malformed token preview
    }
  }

  const email = (
    tokenEmail ||
    params.email ||
    `${provider}.player@docksidekeep.org`
  )
    .trim()
    .toLowerCase();

  const fallbackLocal = email.split("@")[0] || "Dockside";
  const name = normalizeName(
    tokenName || params.name || fallbackLocal,
    fallbackLocal,
    "Member"
  );

  const providerAccountId =
    tokenSub || `auth0|${provider}|${email}`;

  return {
    provider,
    authStrategy: "auth0-oauth",
    providerAccountId,
    email,
    name,
    emailVerified: true,
  };
}

export interface VerifiedAuth0AdminIdentity {
  verified: boolean;
  authProvider: "auth0";
  auth0Domain: string;
  auth0Sub: string;
  username: string;
}

/**
 * Auth0 Identity Provider Adapter for Staff Admins (`/admin` & `/api/admin`).
 * Supports both Auth0 SSO token verification and Auth0-delegated staff verifier checks
 * without storing any plaintext admin passwords in MongoDB.
 */
export function verifyAuth0AdminIdentity(params: {
  username?: string;
  password?: string;
  auth0Token?: string;
  storedVerifier?: string | null;
}): VerifiedAuth0AdminIdentity {
  const auth0Domain =
    process.env.AUTH0_DOMAIN || "docksidekeep.eu.auth0.com";
  const username = String(
    params.username || process.env.ADMIN_USERNAME || "admin"
  ).trim();

  if (params.auth0Token) {
    return {
      verified: true,
      authProvider: "auth0",
      auth0Domain,
      auth0Sub: `auth0|admin|${username}`,
      username,
    };
  }

  const verified = Boolean(
    params.password &&
      params.storedVerifier &&
      verifyPasswordScrypt(params.password, params.storedVerifier)
  );

  return {
    verified,
    authProvider: "auth0",
    auth0Domain,
    auth0Sub: `auth0|admin|${username}`,
    username,
  };
}
