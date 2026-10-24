import { beforeEach, describe, it, expect, vi } from "vitest";

let mockSession: any = null;
vi.mock("@/auth", () => ({ auth: async () => mockSession }));
import {
  buildAdminSession,
  createFrozenAuditRow,
  deepFreeze,
  hasAdminPrivilege,
  normalizeAdminRole,
  resolveAdminSessionFromRequest,
  resolveCustomerUserFromRequest,
  sanitizeAuditValue,
} from "@/lib/admin";
import {
  hashPasswordScrypt,
  isScryptHash,
  verifyPasswordScrypt,
} from "@/lib/auth-security";
import { translations } from "@/lib/i18n";

beforeEach(() => {
  mockSession = null;
});

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

    // A forged header token is ignored: identity only comes from the Auth.js session
    const forgedReq = new Request("http://localhost:3000/api/items", {
      headers: {
        "x-admin-token": "dockside-keep-admin-session-token",
        authorization: "Bearer dockside-keep-admin-session-token",
      },
    });
    expect(await resolveAdminSessionFromRequest(forgedReq, null)).toBeNull();

    // A customer session is never an admin session
    mockSession = { user: { kind: "customer", email: "alex@docksidekeep.org" } };
    expect(await resolveAdminSessionFromRequest(forgedReq, null)).toBeNull();

    // Valid admin session with in-memory mock DB containing the admin entity
    mockSession = { user: { kind: "admin", username: "admin" } };
    const authedReq = new Request("http://localhost:3000/api/items");

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

    // Session of a deleted/revoked admin account is rejected when checked against the DB
    mockSession = { user: { kind: "admin", username: "revoked_staff" } };
    const resolvedRevoked = await resolveAdminSessionFromRequest(
      authedReq,
      mockDbWithAdmin
    );
    expect(resolvedRevoked).toBeNull();
  });

  it("verifies logged-in customer entities from the Auth.js session and the users collection", async () => {
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

    // x-user-email is never trusted
    const spoofedReq = new Request("http://localhost:3000/api/orders", {
      headers: { "x-user-email": "alex@docksidekeep.org" },
    });
    expect(
      await resolveCustomerUserFromRequest(spoofedReq, mockDbWithUsers)
    ).toBeNull();

    mockSession = { user: { kind: "customer", email: "Alex@Docksidekeep.org" } };
    const customer = await resolveCustomerUserFromRequest(
      spoofedReq,
      mockDbWithUsers
    );
    expect(customer).toEqual({
      email: "alex@docksidekeep.org",
      name: "Alex Mercer",
    });

    // An admin session is not a customer session
    mockSession = { user: { kind: "admin", username: "admin" } };
    expect(
      await resolveCustomerUserFromRequest(spoofedReq, mockDbWithUsers)
    ).toBeNull();
    mockSession = null;
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

  it("verifies salted scrypt password hashing and audit redaction", () => {
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
  });
});
