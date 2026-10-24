import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db";
import {
  hashPasswordScrypt,
  isScryptHash,
  verifyPasswordScrypt,
} from "@/lib/auth-security";
import { upsertGoogleCustomer } from "@/lib/customers";
import { nowUtcIso } from "@/lib/premium";

export type AuthKind = "admin" | "customer";

declare module "next-auth" {
  interface User {
    kind?: AuthKind;
    username?: string;
  }
  interface Session {
    user: {
      kind?: AuthKind;
      /** Admin username (admin sessions only). */
      username?: string;
    } & DefaultSession["user"];
  }
}

// Brute-force throttle for password logins: 5 failures per key per 15 minutes (per server process).
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; firstAtMs: number }>();

function isThrottled(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAtMs > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.firstAtMs > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, firstAtMs: Date.now() });
  } else {
    entry.count += 1;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Google,
    Credentials({
      id: "admin",
      name: "Admin",
      credentials: { username: {}, password: {} },
      async authorize(credentials) {
        const username = String(credentials?.username || "").trim();
        const password = String(credentials?.password || "");
        if (!username || !password) return null;
        const throttleKey = `admin:${username.toLowerCase()}`;
        if (isThrottled(throttleKey)) return null;

        const db = await getDb();
        const adminDoc = db
          ? await db.collection("admins").findOne({ username })
          : null;
        const verifier = adminDoc?.passwordHash || adminDoc?.password;
        if (!adminDoc || !verifyPasswordScrypt(password, verifier)) {
          recordFailure(throttleKey);
          return null;
        }
        failures.delete(throttleKey);

        // Transparently upgrade legacy plaintext verifiers to salted scrypt
        if (adminDoc.password || !isScryptHash(adminDoc.passwordHash)) {
          await db!.collection("admins").updateOne(
            { username },
            {
              $set: {
                passwordHash: hashPasswordScrypt(password),
                updatedAtUtc: nowUtcIso(),
              },
              $unset: { password: "" },
            }
          );
        }
        return {
          id: String(adminDoc._id),
          name: adminDoc.username,
          kind: "admin" as const,
          username: String(adminDoc.username),
        };
      },
    }),
    Credentials({
      id: "customer",
      name: "Customer",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;
        const throttleKey = `customer:${email}`;
        if (isThrottled(throttleKey)) return null;

        const db = await getDb();
        const found = db ? await db.collection("users").findOne({ email }) : null;
        const verifier = found?.passwordHash || found?.password;
        if (!found || !verifyPasswordScrypt(password, verifier)) {
          recordFailure(throttleKey);
          return null;
        }
        failures.delete(throttleKey);

        if (found.password || !isScryptHash(found.passwordHash)) {
          await db!.collection("users").updateOne(
            { _id: found._id },
            {
              $set: {
                authStrategy: "auth0-db",
                passwordHash: hashPasswordScrypt(password),
                contactEmail: found.contactEmail || found.email,
                updatedAtUtc: nowUtcIso(),
              },
              $unset: { password: "" },
            }
          );
        }
        return {
          id: String(found._id),
          email: String(found.email),
          kind: "customer" as const,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const email = String(profile?.email || "").trim().toLowerCase();
      if (!email || profile?.email_verified !== true) return false;
      const db = await getDb();
      if (!db) return false;
      await upsertGoogleCustomer(db, {
        email,
        sub: account.providerAccountId,
        name: profile?.given_name || profile?.family_name
          ? {
              firstName: String(profile?.given_name || ""),
              lastName: String(profile?.family_name || ""),
            }
          : profile?.name,
      });
      return true;
    },
    async jwt({ token, user, account }) {
      const t = token as Record<string, unknown>;
      if (account?.provider === "google") {
        t.kind = "customer";
        t.username = undefined;
        token.email = String(token.email || "").toLowerCase();
      } else if (user?.kind) {
        t.kind = user.kind;
        t.username = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      session.user.kind = t.kind as AuthKind | undefined;
      session.user.username = t.username as string | undefined;
      return session;
    },
  },
});
