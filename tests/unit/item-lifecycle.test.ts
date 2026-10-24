import { describe, it, expect } from "vitest";
import {
  canTransitionItemStage,
  detectMissingItemFields,
  formatBrowserDateTime,
  getEffectiveItemMoney,
  getItemSaleStage,
  isEventEnded,
  isEventFull,
  isIsoDateString,
  isStoreItemInStock,
  isWithinAddedWindow,
  ITEM_STAGE_TRANSITIONS,
  normalizeNotifications,
  paginateItems,
  parseInventoryCsv,
  toUtcIso,
} from "@/lib/premium";

describe("Store Item Lifecycle (Hidden -> Pre Order Soon -> Pre Order -> Coming Soon -> Regular <-> Out of stock <-> Won't be stocked)", () => {
  it("normalizes dates to UTC ISO-8601 format", () => {
    const iso = toUtcIso("2026-10-21T12:00:00+03:00");
    expect(iso).toBe("2026-10-21T09:00:00.000Z");
    expect(toUtcIso("")).toBeNull();
  });

  it("computes all 7 item lifecycle stages from UTC schedules, stock, and wontBeStocked flags", () => {
    const now = "2026-06-15T12:00:00.000Z";

    // 1. Hidden
    expect(getItemSaleStage({ isHidden: true }, now)).toBe("hidden");
    expect(getItemSaleStage({ lifecycleStage: "hidden" }, now)).toBe("hidden");
    expect(
      getItemSaleStage({ revealAtUtc: "2026-07-01T00:00:00.000Z" }, now)
    ).toBe("hidden");

    // 2. Pre Order Soon
    expect(
      getItemSaleStage(
        {
          revealAtUtc: "2026-06-01T00:00:00.000Z",
          preOrderAtUtc: "2026-06-20T00:00:00.000Z",
          regularSaleAtUtc: "2026-07-01T00:00:00.000Z",
        },
        now
      )
    ).toBe("pre-order-soon");
    expect(
      getItemSaleStage({ lifecycleStage: "pre-order-soon" }, now)
    ).toBe("pre-order-soon");

    // 3. Pre Order
    expect(
      getItemSaleStage(
        {
          revealAtUtc: "2026-06-01T00:00:00.000Z",
          preOrderAtUtc: "2026-06-10T00:00:00.000Z",
          regularSaleAtUtc: "2026-07-01T00:00:00.000Z",
        },
        now
      )
    ).toBe("pre-order");

    // 4. Coming Soon (after pre-order ends via comingSoonAtUtc, or when no pre-order is set before regularSaleAtUtc)
    expect(
      getItemSaleStage(
        {
          revealAtUtc: "2026-06-01T00:00:00.000Z",
          preOrderAtUtc: "2026-06-05T00:00:00.000Z",
          comingSoonAtUtc: "2026-06-12T00:00:00.000Z",
          regularSaleAtUtc: "2026-07-01T00:00:00.000Z",
        },
        now
      )
    ).toBe("coming-soon");
    expect(
      getItemSaleStage(
        {
          revealAtUtc: "2026-06-01T00:00:00.000Z",
          preOrderAtUtc: null,
          regularSaleAtUtc: "2026-07-01T00:00:00.000Z",
        },
        now
      )
    ).toBe("coming-soon");

    // 5. Regular
    expect(
      getItemSaleStage(
        {
          revealAtUtc: "2026-06-01T00:00:00.000Z",
          regularSaleAtUtc: "2026-06-10T00:00:00.000Z",
        },
        now
      )
    ).toBe("regular");

    // 6. Out of stock & 7. Won't be stocked (Won't be stocked can be regular too when stock > 0)
    expect(
      getItemSaleStage(
        { wontBeStocked: true, inStock: true, quantity: 4 },
        now
      )
    ).toBe("regular");
    expect(
      getItemSaleStage(
        {
          lifecycleStage: "wont-be-stocked",
          wontBeStocked: true,
          inStock: true,
          quantity: 2,
        },
        now
      )
    ).toBe("regular");
    expect(
      getItemSaleStage(
        { wontBeStocked: true, inStock: false, quantity: 0 },
        now
      )
    ).toBe("wont-be-stocked");
    expect(
      getItemSaleStage(
        { wontBeStocked: false, inStock: false, quantity: 0 },
        now
      )
    ).toBe("out-of-stock");
  });

  it("enforces allowed transitions in the item lifecycle state machine", () => {
    expect(ITEM_STAGE_TRANSITIONS.hidden).toContain("pre-order-soon");
    expect(canTransitionItemStage("hidden", "pre-order-soon")).toBe(true);
    expect(canTransitionItemStage("pre-order-soon", "pre-order")).toBe(true);
    expect(canTransitionItemStage("pre-order", "coming-soon")).toBe(true);
    expect(canTransitionItemStage("coming-soon", "regular")).toBe(true);

    // Bidirectional Regular <-> Out of stock <-> Won't be stocked (and Regular <-> Won't be stocked)
    expect(canTransitionItemStage("regular", "out-of-stock")).toBe(true);
    expect(canTransitionItemStage("out-of-stock", "regular")).toBe(true);
    expect(canTransitionItemStage("out-of-stock", "wont-be-stocked")).toBe(true);
    expect(canTransitionItemStage("wont-be-stocked", "out-of-stock")).toBe(true);
    expect(canTransitionItemStage("wont-be-stocked", "regular")).toBe(true);
    expect(canTransitionItemStage("regular", "wont-be-stocked")).toBe(true);

    // Disallowed reverse jumps into pre-release stages from out-of-stock
    expect(canTransitionItemStage("out-of-stock", "pre-order-soon")).toBe(false);
    expect(canTransitionItemStage("wont-be-stocked", "pre-order")).toBe(false);
  });

  it("evaluates Pre-Order discounted price vs Regular price", () => {
    const now = "2026-06-15T12:00:00.000Z";
    const preOrderItem = {
      money: { price: 180, currencyId: "ILS" },
      preOrderMoney: { price: 150, currencyId: "ILS" },
      revealAtUtc: "2026-06-01T00:00:00.000Z",
      preOrderAtUtc: "2026-06-10T00:00:00.000Z",
      regularSaleAtUtc: "2026-07-01T00:00:00.000Z",
    };
    expect(getEffectiveItemMoney(preOrderItem, now)).toEqual({
      price: 150,
      currencyId: "ILS",
    });
    expect(
      getEffectiveItemMoney(preOrderItem, "2026-08-01T00:00:00.000Z")
    ).toEqual({
      price: 180,
      currencyId: "ILS",
    });
  });

  it("parses CSV inventory rows, detects missing fields, and evaluates catalog filters", () => {
    expect(normalizeNotifications(undefined)).toEqual({
      restockAlerts: false,
      orderStatusUpdates: false,
      newsletterAndArrivals: false,
    });

    const csv = [
      "slug,title,title_he,price,currencyId,quantity,description,imageUrl",
      "catan-seafarers,Catan Seafarers,קטאן יורדי הים,190,ILS,8,Expansion for Catan,https://example.com/catan.png",
    ].join("\n");
    const parsed = parseInventoryCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].slug).toBe("catan-seafarers");
    expect(parsed[0].price).toBe(190);
    expect(parsed[0].quantity).toBe(8);

    const incompleteEvent = {
      slug: "legacy-event",
      kind: "event",
      title: "Legacy Event",
      money: { price: 50, currencyId: "ILS" },
      quantity: 10,
      description: "",
      imageUrl: "",
      eventDate: "",
      venue: "",
    };
    const missing = detectMissingItemFields(incompleteEvent);
    expect(missing).toContain("description");
    expect(missing).toContain("imageUrl");
    expect(missing).toContain("eventDate");
    expect(missing).toContain("venue");

    const iso = "2026-10-22T19:00:00.000Z";
    expect(isIsoDateString(iso)).toBe(true);
    expect(isIsoDateString("Friday, 19:00")).toBe(false);
    expect(formatBrowserDateTime(iso, "en-US")).toContain("2026");

    expect(isStoreItemInStock({ inStock: true, quantity: 3 })).toBe(true);
    expect(isStoreItemInStock({ inStock: true, quantity: 0 })).toBe(false);
    expect(isStoreItemInStock({ inStock: false, quantity: 5 })).toBe(false);

    const nowMs = new Date("2026-10-22T12:00:00.000Z").getTime();
    expect(
      isEventEnded({ eventDate: "2026-10-20T18:00:00.000Z" }, nowMs)
    ).toBe(true);
    expect(
      isEventFull({ inStock: true, quantity: 5, registeredCount: 16, maxPlayers: 16 })
    ).toBe(true);
    expect(
      isWithinAddedWindow(
        { createdAtUtc: "2026-10-20T12:00:00.000Z" },
        "7d",
        nowMs
      )
    ).toBe(true);

    const sampleItems = Array.from({ length: 22 }, (_, i) => `item-${i + 1}`);
    const page1 = paginateItems(sampleItems, 1, 9);
    expect(page1.pageItems).toHaveLength(9);
    expect(page1.totalPages).toBe(3);
  });
});
