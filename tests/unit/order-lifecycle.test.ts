import { describe, it, expect } from "vitest";
import { handleOrderTtlDeletionEvent } from "@/lib/store";
import {
  ALL_PAYMENT_METHOD_TYPES,
  calculateLoyaltyStatus,
  calculatePaymentMethodFee,
  canStoreCancelOrder,
  canTransitionOrderStatus,
  canUserAbortOrder,
  computeThreeDayReservationUtc,
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_PAYMENT_METHODS_CONFIG,
  DEFAULT_PREMIUM_CLASSES,
  normalizeOrderStatus,
  normalizePaymentMethodsConfig,
  ORDER_LIFECYCLE_STEPS,
} from "@/lib/premium";

describe("Orders Lifecycle (In cart -> ordered (not paid) -> ordered (paid) -> packaged -> sent/waiting for collection -> completed)", () => {
  it("defines the ordered progression steps and normalizes legacy statuses", () => {
    expect(ORDER_LIFECYCLE_STEPS).toEqual([
      "in-cart",
      "ordered-not-paid",
      "ordered-paid",
      "packaged",
      "sent-or-waiting",
      "completed",
    ]);

    expect(normalizeOrderStatus("in-cart")).toBe("in-cart");
    expect(normalizeOrderStatus("ordered-not-paid")).toBe("ordered-not-paid");
    expect(normalizeOrderStatus("reserved-3-days")).toBe("ordered-not-paid");
    expect(normalizeOrderStatus("ordered-paid")).toBe("ordered-paid");
    expect(normalizeOrderStatus("confirmed")).toBe("ordered-paid");
    expect(normalizeOrderStatus("packaged")).toBe("packaged");
    expect(normalizeOrderStatus("approved")).toBe("packaged");
    expect(normalizeOrderStatus("sent-or-waiting")).toBe("sent-or-waiting");
    expect(normalizeOrderStatus("completed")).toBe("completed");
    expect(normalizeOrderStatus("cancelled")).toBe("cancelled");
    expect(normalizeOrderStatus("declined")).toBe("cancelled");
    expect(normalizeOrderStatus("aborted")).toBe("aborted");
  });

  it("allows the store to cancel an order at any point BEFORE completed, and forbids cancelling once completed", () => {
    // In cart is not an order yet; once ordered, store can cancel at any point before completed
    expect(canStoreCancelOrder("in-cart")).toBe(false);
    expect(canStoreCancelOrder("ordered-not-paid")).toBe(true);
    expect(canStoreCancelOrder("ordered-paid")).toBe(true);
    expect(canStoreCancelOrder("packaged")).toBe(true);
    expect(canStoreCancelOrder("sent-or-waiting")).toBe(true);

    // Once completed or already terminated, store cannot cancel
    expect(canStoreCancelOrder("completed")).toBe(false);
    expect(canStoreCancelOrder("cancelled")).toBe(false);
    expect(canStoreCancelOrder("aborted")).toBe(false);

    expect(
      canTransitionOrderStatus("ordered-not-paid", "cancelled", "store")
    ).toBe(true);
    expect(
      canTransitionOrderStatus("ordered-paid", "cancelled", "store")
    ).toBe(true);
    expect(
      canTransitionOrderStatus("packaged", "cancelled", "store")
    ).toBe(true);
    expect(
      canTransitionOrderStatus("sent-or-waiting", "cancelled", "store")
    ).toBe(true);
    expect(
      canTransitionOrderStatus("completed", "cancelled", "store")
    ).toBe(false);
  });

  it("allows the user to abort an order at any point BEFORE packaged, and forbids aborting once packaged or beyond", () => {
    expect(canUserAbortOrder("in-cart")).toBe(true);
    expect(canUserAbortOrder("ordered-not-paid")).toBe(true);
    expect(canUserAbortOrder("ordered-paid")).toBe(true);

    // Once packaged, sent-or-waiting, completed, cancelled, or aborted, user cannot abort
    expect(canUserAbortOrder("packaged")).toBe(false);
    expect(canUserAbortOrder("sent-or-waiting")).toBe(false);
    expect(canUserAbortOrder("completed")).toBe(false);
    expect(canUserAbortOrder("cancelled")).toBe(false);
    expect(canUserAbortOrder("aborted")).toBe(false);

    expect(
      canTransitionOrderStatus("ordered-not-paid", "aborted", "user")
    ).toBe(true);
    expect(
      canTransitionOrderStatus("ordered-paid", "aborted", "user")
    ).toBe(true);
    expect(
      canTransitionOrderStatus("packaged", "aborted", "user")
    ).toBe(false);
    expect(
      canTransitionOrderStatus("sent-or-waiting", "aborted", "user")
    ).toBe(false);
    expect(
      canTransitionOrderStatus("completed", "aborted", "user")
    ).toBe(false);
    // Users cannot set arbitrary store statuses
    expect(
      canTransitionOrderStatus("ordered-not-paid", "packaged", "user")
    ).toBe(false);
  });

  it("includes Wait in Store pickup and computes 3-day reservation UTC for bank/cash orders", () => {
    expect(
      DEFAULT_DELIVERY_OPTIONS.some(
        (o) => o.id === "wait-in-store" && o.isStorePickup
      )
    ).toBe(true);
    const baseMs = Date.parse("2026-10-21T00:00:00.000Z");
    expect(computeThreeDayReservationUtc(baseMs)).toBe(
      "2026-10-24T00:00:00.000Z"
    );
  });

  it("calculates rolling 1-month loyalty points and ignores cancelled and aborted orders", () => {
    const nowMs = Date.parse("2026-10-21T12:00:00.000Z");
    const activeOrder = {
      status: "ordered-paid",
      createdAtUtc: "2026-10-10T12:00:00.000Z",
      pointsEarned: 250,
    };
    const cancelledOrder = {
      status: "cancelled",
      createdAtUtc: "2026-10-12T12:00:00.000Z",
      pointsEarned: 500,
    };
    const abortedOrder = {
      status: "aborted",
      createdAtUtc: "2026-10-14T12:00:00.000Z",
      pointsEarned: 500,
    };
    const oldOrder = {
      status: "completed",
      createdAtUtc: "2026-08-01T12:00:00.000Z",
      pointsEarned: 500,
    };

    const statusBronze = calculateLoyaltyStatus(
      [activeOrder, cancelledOrder, abortedOrder, oldOrder],
      DEFAULT_PREMIUM_CLASSES,
      null,
      nowMs
    );
    expect(statusBronze.monthlyPoints).toBe(250);
    expect(statusBronze.currentClass?.id).toBe("bronze");
    expect(statusBronze.discountPercent).toBe(5);
    expect(statusBronze.nextClass?.id).toBe("silver");
    expect(statusBronze.pointsNeededForNext).toBe(50);

    const statusGold = calculateLoyaltyStatus(
      [{ ...activeOrder, pointsEarned: 650 }],
      DEFAULT_PREMIUM_CLASSES,
      null,
      nowMs
    );
    expect(statusGold.currentClass?.id).toBe("gold");
    expect(statusGold.nextClass).toBeNull();

    const statusAffiliate = calculateLoyaltyStatus(
      [activeOrder],
      DEFAULT_PREMIUM_CLASSES,
      "affiliate-vip",
      nowMs
    );
    expect(statusAffiliate.isAdminAssigned).toBe(true);
    expect(statusAffiliate.currentClass?.id).toBe("affiliate-vip");
    expect(statusAffiliate.discountPercent).toBe(20);
  });

  it("handles expired-hold TTL events to cancel expired 3-day unpaid orders and restore stock while preserving order history", async () => {
    const ordersStore: Record<string, any> = {
      "ord-unpaid-1": {
        _id: "ord-unpaid-1",
        status: "ordered-not-paid",
        items: [
          { slug: "catan-base", quantity: 2 },
          { slug: "fnm-draft-2026", quantity: 1 },
        ],
      },
      "ord-paid-2": {
        _id: "ord-paid-2",
        status: "ordered-paid",
        items: [{ slug: "catan-base", quantity: 1 }],
      },
    };
    const itemsStore: Record<string, any> = {
      "catan-base": {
        slug: "catan-base",
        quantity: 0,
        registeredCount: 2,
        inStock: false,
        lifecycleStage: "out-of-stock",
      },
    };
    const eventsStore: Record<string, any> = {
      "fnm-draft-2026": {
        slug: "fnm-draft-2026",
        quantity: 3,
        registeredCount: 5,
        inStock: true,
      },
    };

    const mockDb: any = {
      collection(name: string) {
        if (name === "orders") {
          return {
            findOne: async (q: any) => ordersStore[String(q._id)] || null,
            updateOne: async (q: any, u: any) => {
              const doc = ordersStore[String(q._id)];
              if (!doc) return { matchedCount: 0 };
              if (u.$set) Object.assign(doc, u.$set);
              return { matchedCount: 1 };
            },
          };
        }
        if (name === "items") {
          return {
            updateOne: async (q: any, u: any) => {
              const doc = itemsStore[q.slug];
              if (!doc) return { matchedCount: 0 };
              if (u.$inc) {
                doc.quantity += u.$inc.quantity || 0;
                doc.registeredCount += u.$inc.registeredCount || 0;
              }
              if (u.$set) Object.assign(doc, u.$set);
              return { matchedCount: 1 };
            },
          };
        }
        if (name === "events") {
          return {
            updateOne: async (q: any, u: any) => {
              const doc = eventsStore[q.slug];
              if (!doc) return { matchedCount: 0 };
              if (u.$inc) {
                doc.quantity += u.$inc.quantity || 0;
                doc.registeredCount += u.$inc.registeredCount || 0;
              }
              if (u.$set) Object.assign(doc, u.$set);
              return { matchedCount: 1 };
            },
          };
        }
        return {
          updateOne: async () => ({ matchedCount: 1 }),
          insertOne: async () => ({ insertedId: "log-1" }),
        };
      },
    };

    // 1. Trigger TTL deletion event for an expired `ordered-not-paid` order
    const res1 = await handleOrderTtlDeletionEvent(mockDb, {
      operationType: "delete",
      documentKey: { _id: "ord-unpaid-1" },
      fullDocumentBeforeChange: {
        _id: "ord-unpaid-1",
        orderId: "ord-unpaid-1",
        items: [
          { slug: "catan-base", quantity: 2 },
          { slug: "fnm-draft-2026", quantity: 1 },
        ],
      },
    });

    expect(res1).toEqual({
      handled: true,
      orderId: "ord-unpaid-1",
      status: "cancelled",
    });
    expect(ordersStore["ord-unpaid-1"].status).toBe("cancelled");
    expect(ordersStore["ord-unpaid-1"].cancelledReason).toBe(
      "ttl-expired-3-days"
    );
    expect(itemsStore["catan-base"].quantity).toBe(2);
    expect(itemsStore["catan-base"].inStock).toBe(true);
    expect(itemsStore["catan-base"].lifecycleStage).toBe("regular");
    expect(eventsStore["fnm-draft-2026"].quantity).toBe(4);
    expect(eventsStore["fnm-draft-2026"].registeredCount).toBe(4);

    // 2. If an order was already paid (`ordered-paid`), a late TTL deletion event is safely ignored
    const res2 = await handleOrderTtlDeletionEvent(mockDb, {
      operationType: "delete",
      documentKey: { _id: "ord-paid-2" },
    });
    expect(res2).toEqual({
      handled: false,
      orderId: "ord-paid-2",
      status: "ordered-paid",
      reason: "already-resolved",
    });
    expect(ordersStore["ord-paid-2"].status).toBe("ordered-paid");
    expect(itemsStore["catan-base"].quantity).toBe(2);
  });

  it("normalizes admin-configurable payment methods and calculates percentage + constant fees on (discountedItems + deliveryCost)", () => {
    // 1. Default config has 8 payment methods: paybox & bit disabled by default, the other 6 active by default
    expect(DEFAULT_PAYMENT_METHODS_CONFIG).toHaveLength(8);
    expect(DEFAULT_PAYMENT_METHODS_CONFIG.map((m) => m.type)).toEqual(
      ALL_PAYMENT_METHOD_TYPES
    );
    for (const pm of DEFAULT_PAYMENT_METHODS_CONFIG) {
      if (pm.type === "paybox" || pm.type === "bit") {
        expect(pm.active).toBe(false);
      } else {
        expect(pm.active).toBe(true);
      }
      expect(pm.feePercent).toBe(0);
      expect(pm.feeConstant).toEqual({ price: 0, currencyId: "ILS" });
    }

    // 2. Custom config with percentage + constant fee and disabled methods
    const customCfg = normalizePaymentMethodsConfig([
      {
        type: "credit-card",
        active: true,
        feePercent: 2.5,
        feeConstant: { price: 2, currencyId: "ILS" },
      },
      {
        type: "paypal",
        active: false,
        feePercent: 3.5,
        feeConstant: { price: 1.5, currencyId: "ILS" },
      },
      {
        type: "bank-transfer",
        active: true,
        feePercent: 0,
        feeConstant: { price: 0, currencyId: "ILS" },
      },
    ]);

    const ccCfg = customCfg.find((m) => m.type === "credit-card")!;
    const paypalCfg = customCfg.find((m) => m.type === "paypal")!;
    const bankCfg = customCfg.find((m) => m.type === "bank-transfer")!;

    expect(ccCfg.active).toBe(true);
    expect(ccCfg.feePercent).toBe(2.5);
    expect(ccCfg.feeConstant.price).toBe(2);
    expect(paypalCfg.active).toBe(false);
    expect(bankCfg.active).toBe(true);

    // Pre-fee order total = discountedItems (165) + deliveryCost (35) = 200 ILS
    // Credit card fee = 200 * (2.5 / 100) + 2 = 5 + 2 = 7 ILS
    const ccFee = calculatePaymentMethodFee(200, ccCfg, "ILS");
    expect(ccFee).toEqual({ price: 7, currencyId: "ILS" });

    // Bank transfer fee = 200 * 0 + 0 = 0 ILS
    const bankFee = calculatePaymentMethodFee(200, bankCfg, "ILS");
    expect(bankFee).toEqual({ price: 0, currencyId: "ILS" });

    // 3. Safety guard: if all 6 methods are passed as active: false, the first method stays active
    const allDisabledAttempt = normalizePaymentMethodsConfig(
      ALL_PAYMENT_METHOD_TYPES.map((type) => ({
        type,
        active: false,
        feePercent: -5,
        feeConstant: -10,
      }))
    );
    expect(allDisabledAttempt.some((m) => m.active)).toBe(true);
    expect(allDisabledAttempt[0].active).toBe(true);
    expect(allDisabledAttempt[0].feePercent).toBe(0);
    expect(allDisabledAttempt[0].feeConstant.price).toBe(0);
  });
});
