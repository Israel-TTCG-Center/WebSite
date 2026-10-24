import { describe, it, expect } from "vitest";
import {
  buildAdminSession,
  createAdminToken,
  createFrozenAuditRow,
  deepFreeze,
  getAdminSessionFromToken,
  hasAdminPrivilege,
  normalizeAdminRole,
  resolveAdminSessionFromRequest,
  resolveCustomerUserFromRequest,
  sanitizeAuditValue,
} from "@/lib/admin";
import {
  hashPasswordScrypt,
  isScryptHash,
  verifyAuth0AdminIdentity,
  verifyPasswordScrypt,
  verifyThirdPartyIdentity,
} from "@/lib/auth-security";
import { translations } from "@/lib/i18n";

describe("Logged-In Entity Verification (Never Trust URL ?admin=1), Admin RBAC & Auth0 Security", () => {
  it("never trusts ?admin=1 in the request URL and verifies the logged-in admin entity against the DB", async () => {
    const fakeUrlAdminReq = new Request(
      "http://localhost:3000/api/items?admin=1"
    );
    const resolvedSpoof = await resolveAdminSessionFromRequest(
      fakeUrlAdminReq,
      null
    );
    expect(resolvedSpoof).toBeNull();

    // Valid token with in-memory mock DB containing the admin entity
    const ownerSession = buildAdminSession({
      username: "admin",
      role: "owner",
    });
    const validToken = createAdminToken(ownerSession);
    const authedReq = new Request("http://localhost:3000/api/items", {
      headers: { "x-admin-token": validToken },
    });

    const mockDbWithAdmin = {
      collection: (name: string) => ({
        findOne: async (query: Record<string, unknown>) => {
          if (name === "admins" && query.username === "admin") {
            return {
              username: "admin",
              role: "owner",
              privileges: [
                "inventory",
                "events",
                "metadata",
                "blog",
                "manage_admins",
              ],
            };
          }
          return null;
        },
      }),
    } as any;

    const resolvedValid = await resolveAdminSessionFromRequest(
      authedReq,
      mockDbWithAdmin
    );
    expect(resolvedValid).not.toBeNull();
    expect(resolvedValid?.username).toBe("admin");
    expect(resolvedValid?.role).toBe("owner");

    // Token for a deleted/revoked admin account is rejected when checked against the DB
    const revokedSession = buildAdminSession({
      username: "revoked_staff",
      role: "support",
    });
    const revokedToken = createAdminToken(revokedSession);
    const revokedReq = new Request("http://localhost:3000/api/items", {
      headers: { Authorization: `Bearer ${revokedToken}` },
    });
    const resolvedRevoked = await resolveAdminSessionFromRequest(
      revokedReq,
      mockDbWithAdmin
    );
    expect(resolvedRevoked).toBeNull();
  });

  it("verifies logged-in customer entities from x-user-email and the users collection", async () => {
    const mockDbWithUsers = {
      collection: (name: string) => ({
        findOne: async (query: Record<string, unknown>) => {
          if (name === "users" && query.email === "alex@docksidekeep.org") {
            return {
              email: "alex@docksidekeep.org",
              name: "Alex Mercer",
            };
          }
          return null;
        },
      }),
    } as any;

    const reqWithHeader = new Request("http://localhost:3000/api/orders", {
      headers: { "x-user-email": "alex@docksidekeep.org" },
    });
    const customer = await resolveCustomerUserFromRequest(
      reqWithHeader,
      mockDbWithUsers
    );
    expect(customer).toEqual({
      email: "alex@docksidekeep.org",
      name: "Alex Mercer",
    });

    const unauthedReq = new Request("http://localhost:3000/api/orders");
    const unauthedCustomer = await resolveCustomerUserFromRequest(
      unauthedReq,
      mockDbWithUsers
    );
    expect(unauthedCustomer).toBeNull();
  });

  it("normalizes superadmin/owner to root Owner (level 100) and enforces lower-privilege roles", () => {
    expect(normalizeAdminRole("superadmin")).toBe("owner");
    expect(normalizeAdminRole("owner")).toBe("owner");
    expect(normalizeAdminRole("manager")).toBe("manager");
    expect(normalizeAdminRole("editor")).toBe("editor");
    expect(normalizeAdminRole("support")).toBe("support");

    const ownerSession = buildAdminSession({
      username: "admin",
      role: "superadmin",
    });
    expect(ownerSession.role).toBe("owner");
    expect(ownerSession.level).toBe(100);
    expect(hasAdminPrivilege(ownerSession, "manage_admins")).toBe(true);
    expect(hasAdminPrivilege(ownerSession, "inventory")).toBe(true);

    const supportSession = buildAdminSession({
      username: "event_staff",
      role: "support",
      privileges: ["events"],
    });
    expect(supportSession.role).toBe("support");
    expect(supportSession.level).toBe(30);
    expect(hasAdminPrivilege(supportSession, "events")).toBe(true);
    expect(hasAdminPrivilege(supportSession, "manage_admins")).toBe(false);
    expect(hasAdminPrivilege(supportSession, "metadata")).toBe(false);

    const token = createAdminToken(supportSession);
    const decoded = getAdminSessionFromToken(token);
    expect(decoded?.username).toBe("event_staff");
    expect(decoded?.role).toBe("support");
  });

  it("deeply freezes audit log rows and redacts raw passwords and password hashes", () => {
    const ownerSession = buildAdminSession({ username: "admin", role: "owner" });
    const row = createFrozenAuditRow({
      session: ownerSession,
      entityType: "item",
      entityId: "catan-strategy-board-game",
      action: "update",
      summary: "Updated quantity from 5 to 7",
      before: {
        slug: "catan-strategy-board-game",
        quantity: 5,
        password: "secret",
      },
      after: {
        slug: "catan-strategy-board-game",
        quantity: 7,
        nested: { price: 180 },
      },
    });

    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.frozenData)).toBe(true);
    expect(Object.isFrozen(row.frozenData.before as object)).toBe(true);
    expect(Object.isFrozen(row.frozenData.after as object)).toBe(true);
    expect((row.frozenData.before as any).password).toBe("[REDACTED]");
    expect(
      Object.isFrozen(deepFreeze({ a: [1, 2, { b: 3 }] }).a[2] as object)
    ).toBe(true);
  });

  it("verifies Auth0 delegation, salted scrypt password hashing, and one-click Google sign-in", () => {
    expect(translations.en.auth.createAccount).toBe("Create Your Account");
    expect(translations.en.auth.registerTab).toBe("Create Account");

    const plain = "SuperSecretTabletop#2026";
    const hashed = hashPasswordScrypt(plain);
    expect(isScryptHash(hashed)).toBe(true);
    expect(hashed).not.toContain(plain);
    expect(verifyPasswordScrypt(plain, hashed)).toBe(true);
    expect(verifyPasswordScrypt("wrong-password", hashed)).toBe(false);

    const sanitized = sanitizeAuditValue({
      username: "event_staff",
      password: "raw",
      passwordHash: hashed,
    }) as Record<string, unknown>;
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.passwordHash).toBe("[REDACTED]");

    const googleId = verifyThirdPartyIdentity({ provider: "google" });
    expect(googleId.authStrategy).toBe("auth0-oauth");
    expect(googleId.email).toBe("google.player@docksidekeep.org");
    expect(googleId.emailVerified).toBe(true);

    const adminSso = verifyAuth0AdminIdentity({
      username: "admin",
      auth0Token: "auth0-admin-sso-session",
    });
    expect(adminSso.verified).toBe(true);
    expect(adminSso.authProvider).toBe("auth0");
    expect(adminSso.auth0Sub).toBe("auth0|admin|admin");

    const adminVerifierCheck = verifyAuth0AdminIdentity({
      username: "event_staff",
      password: plain,
      storedVerifier: hashed,
    });
    expect(adminVerifierCheck.verified).toBe(true);
  });
});
