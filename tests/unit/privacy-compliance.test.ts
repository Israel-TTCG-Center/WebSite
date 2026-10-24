import { describe, it, expect, vi } from "vitest";
import {
  anonymizeOrderForGdprErasure,
  buildUserPortabilityExport,
  detectGlobalPrivacyControl,
  normalizePrivacyConsent,
  REDACTED_EMAIL,
  REDACTED_TEXT,
} from "@/lib/privacy";

const mockUsers: Record<string, any> = {};
const mockOrders: Record<string, any>[] = [];
const mockLoyalty: Record<string, any> = {};
const mockConsents: Record<string, any> = {};
const mockItems: Record<string, any> = {};

let mockSession: any = null;
vi.mock("@/auth", () => ({ auth: async () => mockSession }));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: async () => ({
      collection(name: string) {
        if (name === "users") {
          return {
            findOne: async (q: any) => {
              const email = String(q.email || "").toLowerCase();
              return mockUsers[email] || null;
            },
            updateOne: async (q: any, u: any) => {
              const email = String(q.email || "").toLowerCase();
              if (mockUsers[email] && u.$set) {
                Object.assign(mockUsers[email], u.$set);
              }
              return { matchedCount: mockUsers[email] ? 1 : 0 };
            },
            deleteOne: async (q: any) => {
              const email = String(q.email || "").toLowerCase();
              delete mockUsers[email];
              return { deletedCount: 1 };
            },
          };
        }
        if (name === "orders") {
          return {
            find: (q: any) => ({
              sort: () => ({
                toArray: async () =>
                  mockOrders.filter(
                    (o) =>
                      String(o.customer?.email || "").toLowerCase() ===
                      String(q["customer.email"] || "").toLowerCase()
                  ),
              }),
              toArray: async () =>
                mockOrders.filter(
                  (o) =>
                    String(o.customer?.email || "").toLowerCase() ===
                    String(q["customer.email"] || "").toLowerCase()
                ),
            }),
            updateOne: async (q: any, u: any) => {
              const ord = mockOrders.find((o) => o._id === q._id);
              if (ord && u.$set) {
                Object.assign(ord, u.$set);
              }
              return { matchedCount: ord ? 1 : 0 };
            },
          };
        }
        if (name === "loyalty_users") {
          return {
            findOne: async (q: any) => mockLoyalty[String(q.email)] || null,
            deleteOne: async (q: any) => {
              delete mockLoyalty[String(q.email)];
              return { deletedCount: 1 };
            },
          };
        }
        if (name === "privacy_consents") {
          return {
            findOne: async (q: any) => mockConsents[String(q.email)] || null,
            updateOne: async (q: any, u: any) => {
              mockConsents[String(q.email)] = { ...(u.$set || {}) };
              return { matchedCount: 1 };
            },
            deleteOne: async (q: any) => {
              delete mockConsents[String(q.email)];
              return { deletedCount: 1 };
            },
          };
        }
        if (name === "items") {
          return {
            updateOne: async (q: any, u: any) => {
              const item = mockItems[q.slug];
              if (!item) return { matchedCount: 0 };
              if (u.$inc) item.quantity += u.$inc.quantity || 0;
              if (u.$set) Object.assign(item, u.$set);
              return { matchedCount: 1 };
            },
          };
        }
        return {
          updateOne: async () => ({ matchedCount: 1 }),
          deleteOne: async () => ({ deletedCount: 1 }),
          insertOne: async () => ({ insertedId: "1" }),
        };
      },
    }),
  };
});

describe("GDPR (EU/UK), California (CCPA/CPRA) & Israeli (PPL Amendment 13 & Anti-Spam Sec. 30A) Compliance", () => {
  it("defaults non-essential consent to Opt-Out (false) and automatically honors Global Privacy Control (Sec-GPC: 1)", () => {
    const defaultConsent = normalizePrivacyConsent(undefined);
    expect(defaultConsent.essential).toBe(true);
    expect(defaultConsent.analytics).toBe(false);
    expect(defaultConsent.marketing).toBe(false);
    expect(defaultConsent.doNotSellOrShare).toBe(false);
    expect(defaultConsent.gpcDetected).toBe(false);
    expect(defaultConsent.regulationFrameworks).toEqual([
      "GDPR",
      "CCPA-CPRA",
      "IL-PPL-13",
    ]);

    // When Sec-GPC: 1 header is present, doNotSellOrShare is forced true and analytics/marketing are forced false
    const gpcHeaders = new Headers({ "Sec-GPC": "1" });
    expect(detectGlobalPrivacyControl(gpcHeaders)).toBe(true);

    const gpcConsent = normalizePrivacyConsent(
      { analytics: true, marketing: true, doNotSellOrShare: false },
      { headers: gpcHeaders }
    );
    expect(gpcConsent.gpcDetected).toBe(true);
    expect(gpcConsent.doNotSellOrShare).toBe(true);
    expect(gpcConsent.analytics).toBe(false);
    expect(gpcConsent.marketing).toBe(false);
  });

  it("anonymizes all PII on historical orders while keeping order items and totals intact for accounting", () => {
    const rawOrder = {
      _id: "ord-101",
      status: "completed",
      items: [{ slug: "catan-base", title: "Catan", quantity: 1 }],
      totalMoney: { price: 180, currencyId: "ILS" },
      contactEmail: "dana@example.com",
      customer: {
        name: "Dana Levi",
        email: "dana@example.com",
        contactEmail: "dana@example.com",
      },
      billingAddress: {
        street: "Herzl 10",
        city: "Haifa",
        postalCode: "32000",
        phone: "050-1234567",
      },
      deliveryAddress: {
        street: "Herzl 10",
        city: "Haifa",
        postalCode: "32000",
        phone: "050-1234567",
      },
      paymentMethod: {
        type: "credit-card",
        nickname: "Personal Visa",
        detail: "Visa •••• 4242",
      },
      gamingAccounts: {
        wizardsAccount: "dana@wizards.com",
        riotAccount: "Dana#IL1",
      },
    };

    const anonymized = anonymizeOrderForGdprErasure(
      rawOrder,
      "2026-10-22T12:00:00.000Z"
    );

    expect(anonymized.customer.name).toBe(REDACTED_TEXT);
    expect(anonymized.customer.email).toBe(REDACTED_EMAIL);
    expect(anonymized.contactEmail).toBe(REDACTED_EMAIL);
    expect(anonymized.billingAddress?.street).toBe(REDACTED_TEXT);
    expect(anonymized.billingAddress?.phone).toBe(REDACTED_TEXT);
    expect(anonymized.deliveryAddress?.street).toBe(REDACTED_TEXT);
    expect(anonymized.paymentMethod?.detail).toBe(REDACTED_TEXT);
    expect(anonymized.gamingAccounts.wizardsAccount).toBe("");
    expect(anonymized.gamingAccounts.riotAccount).toBe("");
    expect((anonymized as any).privacyRedacted).toBe(true);
    // Non-PII accounting & inventory fields remain intact
    expect(anonymized.items).toEqual(rawOrder.items);
    expect(anonymized.totalMoney).toEqual(rawOrder.totalMoney);
    expect(anonymized.status).toBe("completed");
  });

  it("builds a clean Data Portability / Right-to-Inspect JSON export with zero password hashes", () => {
    const bundle = buildUserPortabilityExport({
      user: {
        _id: "u-1",
        name: "Noam Cohen",
        email: "noam@example.com",
        password: "legacy-secret",
        passwordHash: "scrypt$salt$secret",
        gamingAccounts: { wizardsAccount: "noam@mtg", riotAccount: "" },
      },
      orders: [{ _id: "ord-1", status: "completed", totalMoney: { price: 95, currencyId: "ILS" } }],
      loyalty: { _id: "l-1", email: "noam@example.com", points: 95 },
    });

    expect(bundle.schemaVersion).toBe("dockside-privacy-export-v1");
    expect(bundle.profile.email).toBe("noam@example.com");
    expect((bundle.profile as any).password).toBeUndefined();
    expect((bundle.profile as any).passwordHash).toBeUndefined();
    expect(bundle.orders).toHaveLength(1);
    expect((bundle.loyalty as any)?.points).toBe(95);
    expect(bundle.regulations.join(" ")).toContain("GDPR");
    expect(bundle.regulations.join(" ")).toContain("CCPA");
    expect(bundle.regulations.join(" ")).toContain("Israel");
  });

  it("enforces logged-in entity verification on GET/DELETE /api/privacy and executes Data Portability & Right to Erasure", async () => {
    const { GET, POST, DELETE } = await import("@/app/api/privacy/route");

    mockUsers["maya@example.com"] = {
      _id: "u-maya",
      name: "Maya",
      email: "maya@example.com",
      passwordHash: "scrypt$1$2",
    };
    mockLoyalty["maya@example.com"] = {
      _id: "l-maya",
      email: "maya@example.com",
      points: 120,
    };
    mockItems["catan-base"] = {
      slug: "catan-base",
      quantity: 0,
      inStock: false,
      lifecycleStage: "out-of-stock",
    };
    mockOrders.length = 0;
    mockOrders.push(
      {
        _id: "ord-unpaid-maya",
        status: "ordered-not-paid",
        items: [{ slug: "catan-base", quantity: 1 }],
        customer: { name: "Maya", email: "maya@example.com" },
        billingAddress: { street: "HaNamal 5", city: "Haifa", phone: "052-0000000" },
      },
      {
        _id: "ord-completed-maya",
        status: "completed",
        items: [{ slug: "catan-base", quantity: 1 }],
        customer: { name: "Maya", email: "maya@example.com" },
        billingAddress: { street: "HaNamal 5", city: "Haifa", phone: "052-0000000" },
      }
    );

    // 1. Unauthenticated GET /api/privacy is rejected with 401
    const unauthGet = await GET(new Request("http://localhost:3000/api/privacy"));
    expect(unauthGet.status).toBe(401);

    // A spoofed x-user-email header alone is never accepted
    const spoofGet = await GET(
      new Request("http://localhost:3000/api/privacy", {
        headers: { "x-user-email": "maya@example.com" },
      })
    );
    expect(spoofGet.status).toBe(401);

    mockSession = { user: { kind: "customer", email: "maya@example.com" } };

    // 2. Authenticated POST /api/privacy with Sec-GPC: 1 saves GPC-compliant consent
    const postRes = await POST(
      new Request("http://localhost:3000/api/privacy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": "maya@example.com",
          "Sec-GPC": "1",
        },
        body: JSON.stringify({
          email: "maya@example.com",
          consent: { analytics: true, marketing: true },
        }),
      })
    );
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.consent.gpcDetected).toBe(true);
    expect(postJson.consent.doNotSellOrShare).toBe(true);
    expect(postJson.consent.analytics).toBe(false);

    // 3. Authenticated GET /api/privacy exports user data without passwordHash
    const authGet = await GET(
      new Request("http://localhost:3000/api/privacy", {
        headers: { "x-user-email": "maya@example.com" },
      })
    );
    expect(authGet.status).toBe(200);
    const exportData = await authGet.json();
    expect(exportData.profile.email).toBe("maya@example.com");
    expect(exportData.profile.passwordHash).toBeUndefined();
    expect(exportData.orders).toHaveLength(2);

    // 4. Authenticated DELETE /api/privacy deletes user & loyalty record, restores stock on unpaid order, and anonymizes all orders
    const delRes = await DELETE(
      new Request("http://localhost:3000/api/privacy", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": "maya@example.com",
        },
        body: JSON.stringify({ email: "maya@example.com" }),
      })
    );
    expect(delRes.status).toBe(200);
    const delJson = await delRes.json();
    expect(delJson.erasedUser).toBe(true);
    expect(delJson.anonymizedOrdersCount).toBe(2);

    expect(mockUsers["maya@example.com"]).toBeUndefined();
    expect(mockLoyalty["maya@example.com"]).toBeUndefined();
    expect(mockItems["catan-base"].quantity).toBe(1);
    expect(mockItems["catan-base"].inStock).toBe(true);
    expect(mockOrders[0].status).toBe("cancelled");
    expect(mockOrders[0].customer.email).toBe(REDACTED_EMAIL);
    expect(mockOrders[1].status).toBe("completed");
    expect(mockOrders[1].customer.email).toBe(REDACTED_EMAIL);
    expect(mockOrders[1].billingAddress.street).toBe(REDACTED_TEXT);
  });
});
