import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createDb, type Db } from "@/lib/db";
import { buildItemsDbFilter } from "@/lib/store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Postgres document layer (needs TEST_DATABASE_URL)", () => {
  const sql = postgres(url || "postgres://invalid", { prepare: false, max: 4 });
  const db: Db = createDb(sql);

  beforeEach(async () => {
    await sql`truncate items, events, orders, order_ttl_holds, users`;
  });
  afterAll(async () => {
    await sql.end();
  });

  it("upserts with $set/$setOnInsert and finds by key", async () => {
    const col = db.collection("items");
    const r1 = await col.updateOne(
      { slug: "catan" },
      { $set: { slug: "catan", title: "Catan", quantity: 3 }, $setOnInsert: { createdAtUtc: "t0" } },
      { upsert: true }
    );
    expect(r1.upsertedCount).toBe(1);
    const r2 = await col.updateOne(
      { slug: "catan" },
      { $set: { title: "Catan 2" }, $setOnInsert: { createdAtUtc: "t1" } },
      { upsert: true }
    );
    expect(r2.matchedCount).toBe(1);
    const doc = await col.findOne({ slug: "catan" });
    expect(doc).toMatchObject({ title: "Catan 2", createdAtUtc: "t0", quantity: 3 });
    expect(typeof doc?._id).toBe("string");
    expect(await col.findOne({ _id: doc!._id })).toMatchObject({ slug: "catan" });
    expect(await col.findOne({ _id: "not-a-uuid" })).toBeNull();
  });

  it("claims stock atomically: conditional $inc never oversells under concurrency", async () => {
    const col = db.collection("items");
    await col.insertOne({ slug: "fnm", quantity: 5, registeredCount: 0, inStock: true });
    const claim = () =>
      col.findOneAndUpdate(
        { slug: "fnm", inStock: { $ne: false }, quantity: { $gte: 1 } },
        { $inc: { quantity: -1, registeredCount: 1 } },
        { returnDocument: "after" }
      );
    const results = await Promise.all(Array.from({ length: 12 }, claim));
    expect(results.filter(Boolean)).toHaveLength(5);
    const final = await col.findOne({ slug: "fnm" });
    expect(final).toMatchObject({ quantity: 0, registeredCount: 5 });
  });

  it("supports $unset, nested paths, array-element and $nin filters", async () => {
    const col = db.collection("orders");
    await col.insertOne({
      status: "ordered-paid",
      customer: { email: "a@b.c" },
      items: [{ slug: "x", quantity: 1 }, { slug: "y", quantity: 2 }],
      password: "p",
    });
    await col.insertOne({ status: "cancelled", customer: { email: "a@b.c" }, items: [{ slug: "x" }] });
    expect(await col.find({ "customer.email": "a@b.c" }).toArray()).toHaveLength(2);
    expect(await col.find({ "items.slug": "y" }).toArray()).toHaveLength(1);
    expect(
      await col.find({ "items.slug": "x", status: { $nin: ["declined", "cancelled", "aborted"] } }).toArray()
    ).toHaveLength(1);
    await col.updateOne({ "customer.email": "a@b.c", status: "ordered-paid" }, { $unset: { password: "" }, $set: { "customer.name": "N" } });
    const doc = await col.findOne({ status: "ordered-paid" });
    expect(doc?.password).toBeUndefined();
    expect(doc?.customer).toEqual({ email: "a@b.c", name: "N" });
  });

  it("runs the storefront filter, sorting, paging and search from buildItemsDbFilter", async () => {
    const col = db.collection("items");
    const mk = (slug: string, price: number, extra: Record<string, unknown> = {}) =>
      col.insertOne({
        slug, title: slug.toUpperCase(), category: "Store Items", type: "item", inStock: true, quantity: 2,
        money: { price, currencyId: "ILS" }, createdAtUtc: `2026-01-0${price}T00:00:00.000Z`, ...extra,
      });
    await mk("a", 1);
    await mk("b", 3);
    await mk("c", 2, { isHidden: true });
    await mk("d", 5, { quantity: 0, inStock: false });

    const visible = await col.find(buildItemsDbFilter({})).sort({ "money.price": -1 }).toArray();
    expect(visible.map((d) => d.slug)).toEqual(["b", "a"]);
    expect(await col.countDocuments(buildItemsDbFilter({ includeOutOfStock: true }))).toBe(4);
    expect(
      await col.countDocuments(buildItemsDbFilter({ includeOutOfStock: true, includeHidden: false }))
    ).toBe(3);
    expect(await col.countDocuments(buildItemsDbFilter({ maxPrice: 1 }))).toBe(1);
    const search = await col.find(buildItemsDbFilter({ search: "B" })).toArray();
    expect(search.map((d) => d.slug)).toEqual(["b"]);
    const page2 = await col.find({}).sort({ createdAtUtc: 1 }).skip(1).limit(2).toArray();
    expect(page2.map((d) => d.slug)).toEqual(["c", "b"]);
  });

  it("deletes one document and sweeps expired holds by ISO timestamp", async () => {
    const holds = db.collection("order_ttl_holds");
    await holds.insertOne({ orderId: "o1", expiresAt: new Date(Date.now() - 1000) });
    await holds.insertOne({ orderId: "o2", expiresAt: new Date(Date.now() + 60_000) });
    const expired = await holds.find({ expiresAt: { $lte: new Date().toISOString() } }).toArray();
    expect(expired.map((h) => h.orderId)).toEqual(["o1"]);
    expect((await holds.deleteOne({ orderId: "o1" })).deletedCount).toBe(1);
    expect(await holds.countDocuments({})).toBe(1);
  });
});
