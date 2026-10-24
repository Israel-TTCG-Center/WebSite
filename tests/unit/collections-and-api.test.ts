import { describe, it, expect, vi } from "vitest";

// No signed-in session: every request is anonymous.
vi.mock("@/auth", () => ({ auth: async () => null }));
import fs from "node:fs";
import path from "node:path";
import { buildItemsDbFilter } from "@/lib/store";
import { GET as getItems, POST as postItems } from "@/app/api/items/route";
import { GET as getEvents, POST as postEvents } from "@/app/api/events/route";
import { GET as getOrders, PATCH as patchOrders } from "@/app/api/orders/route";
import { GET as getPremium, POST as postPremium } from "@/app/api/premium/route";

describe("Separated items & events Collections, DB Filter Builder & API Route Security", () => {
  it("builds separate DB filters for store items vs events and separates includeHidden from includeOutOfStock", () => {
    const storeFilter = buildItemsDbFilter({
      kind: "item",
      maxPrice: 200,
      includeOutOfStock: false,
      includeHidden: false,
    });
    expect(storeFilter.$and).toBeDefined();
    const storeSerialized = JSON.stringify(storeFilter);
    expect(storeSerialized).toContain('"money.price":{"$lte":200}');
    expect(storeSerialized).toContain('"isHidden":{"$ne":true}');
    expect(storeSerialized).toContain('"lifecycleStage":{"$ne":"hidden"}');

    // When a public user enables "Show Out of Stock", hidden items remain excluded
    const publicShowOutOfStockFilter = buildItemsDbFilter({
      kind: "item",
      includeOutOfStock: true,
      includeHidden: false,
    });
    const pubOutSerialized = JSON.stringify(publicShowOutOfStockFilter);
    expect(pubOutSerialized).toContain('"isHidden":{"$ne":true}');
    expect(pubOutSerialized).not.toContain('"inStock":{"$ne":false}');

    const eventFilter = buildItemsDbFilter({
      kind: "event",
      includeOutOfStock: true,
      includeHidden: true,
    });
    expect(JSON.stringify(eventFilter)).toContain('"kind":"event"');
  });

  it("enforces separate items and events collections in src/lib/store.ts and API routes", () => {
    const rootDir = process.cwd();
    const readRel = (relPath: string) =>
      fs.readFileSync(path.join(rootDir, relPath), "utf8");

    const storeSrc = readRel("src/lib/store.ts");
    expect(storeSrc).not.toContain("DEFAULT_PREMIUM_CLASSES");
    const migrationSql = readRel("supabase/migrations/0001_init.sql");
    expect(migrationSql).toContain("'items', 'events'");
    expect(migrationSql).toContain("items_slug_key");
    expect(migrationSql).toContain("events_slug_key");
    expect(storeSrc).toContain('db.collection("items")');
    expect(storeSrc).toContain('db.collection("events")');
    expect(storeSrc).toContain("getPaginatedItems");
    expect(storeSrc).toContain("getPaginatedEvents");
    expect(storeSrc).toContain("getEventBySlug");
    expect(storeSrc).toContain("getPaginatedBlogPosts");

    // Verify API routes never trust ?admin=1 in the URL
    const itemsRouteSrc = readRel("src/app/api/items/route.ts");
    const eventsRouteSrc = readRel("src/app/api/events/route.ts");
    const premiumRouteSrc = readRel("src/app/api/premium/route.ts");
    const ordersRouteSrc = readRel("src/app/api/orders/route.ts");
    const adminPageSrc = readRel("src/app/admin/page.tsx");

    expect(itemsRouteSrc).not.toContain('searchParams.get("admin")');
    expect(eventsRouteSrc).not.toContain('searchParams.get("admin")');
    expect(premiumRouteSrc).not.toContain('searchParams.get("admin")');
    expect(ordersRouteSrc).not.toContain('searchParams.get("admin")');
    expect(adminPageSrc).not.toContain("?admin=1");

    expect(itemsRouteSrc).toContain("resolveAdminSessionFromRequest");
    expect(eventsRouteSrc).toContain("resolveAdminSessionFromRequest");
    expect(premiumRouteSrc).toContain("resolveAdminSessionFromRequest");
    expect(ordersRouteSrc).toContain("resolveAdminSessionFromRequest");
    expect(ordersRouteSrc).toContain("resolveCustomerUserFromRequest");
  });

  it("blocks unauthenticated write requests to /api/items, /api/events, /api/premium, and /api/orders even when ?admin=1 is in the URL", async () => {
    const spoofPostItem = new Request(
      "http://localhost:3000/api/items?admin=1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "hack-item", title: "Hack" }),
      }
    );
    const itemRes = await postItems(spoofPostItem);
    expect(itemRes.status).toBe(401);

    const spoofPostEvent = new Request(
      "http://localhost:3000/api/events?admin=1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "hack-event", title: "Hack Event" }),
      }
    );
    const eventRes = await postEvents(spoofPostEvent);
    expect(eventRes.status).toBe(401);

    const spoofPostPremium = new Request(
      "http://localhost:3000/api/premium?admin=1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "vip", name: "VIP" }),
      }
    );
    const premRes = await postPremium(spoofPostPremium);
    expect(premRes.status).toBe(401);

    // GET handlers work safely without admin privileges and never leak admin-only users list on ?admin=1
    const spoofGetPremium = new Request(
      "http://localhost:3000/api/premium?admin=1"
    );
    const getPremRes = await getPremium(spoofGetPremium);
    expect(getPremRes.status).toBe(200);
    const getPremData = await getPremRes.json();
    expect(getPremData.users).toEqual([]);

    const getItemsRes = await getItems(
      new Request("http://localhost:3000/api/items?admin=1")
    );
    expect(getItemsRes.status).toBe(200);

    const getEventsRes = await getEvents(
      new Request("http://localhost:3000/api/events?admin=1")
    );
    expect(getEventsRes.status).toBe(200);

    const getOrdersRes = await getOrders(
      new Request("http://localhost:3000/api/orders")
    );
    expect([200, 401]).toContain(getOrdersRes.status);

    // PATCH /api/orders with missing fields returns 400 or 503 when DB is offline
    const badPatchOrder = new Request("http://localhost:3000/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const patchOrderRes = await patchOrders(badPatchOrder);
    expect([400, 503]).toContain(patchOrderRes.status);
  });
});
