import { describe, it, expect } from "vitest";
import {
  translations,
  STORE_CONTACT,
  getLocalizedTitle,
  getLocalizedDescription,
  getLocalizedCategory,
  getLocalizedBadge,
} from "@/lib/i18n";
import { formatMoney, normalizeMoney } from "@/lib/money";
import { INITIAL_ITEMS } from "@/lib/store";
import { cn } from "@/lib/utils";

describe("i18n Hebrew & English Dictionary Parity & Clean Copy", () => {
  it("has identical top-level and nested keys for English (en) and Hebrew (he)", () => {
    const enKeys = Object.keys(translations.en).sort();
    const heKeys = Object.keys(translations.he).sort();
    expect(heKeys).toEqual(enKeys);

    for (const key of enKeys) {
      const enVal = (translations.en as Record<string, unknown>)[key];
      const heVal = (translations.he as Record<string, unknown>)[key];
      if (typeof enVal === "object" && enVal !== null) {
        expect(Object.keys(heVal as object).sort()).toEqual(
          Object.keys(enVal as object).sort()
        );
      } else {
        expect(typeof heVal).toBe("string");
        expect((heVal as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("includes translations for all item lifecycle stages and order lifecycle statuses in both en and he", () => {
    expect(translations.en.card.preOrderSoon).toBe("Pre-Order Soon");
    expect(translations.en.card.preOrder).toBe("Pre-Order");
    expect(translations.en.card.comingSoon).toBe("Coming Soon");
    expect(translations.en.card.outOfStock).toBe("Out of Stock");
    expect(translations.en.card.wontBeStocked).toBe("Won't Be Stocked");
    expect(translations.en.card.wontBeRestockedBadge).toContain("Won't Be Restocked");

    expect(translations.he.card.preOrderSoon).toContain("הזמנה מוקדמת");
    expect(translations.he.card.wontBeStocked).toContain("לא יחודש");

    expect(translations.en.account.abortOrderBtn).toContain("Abort");
    expect(translations.en.account.status["in-cart"]).toContain("In Cart");
    expect(translations.en.account.status["ordered-not-paid"]).toContain("Not Paid");
    expect(translations.en.account.status["ordered-paid"]).toContain("Paid");
    expect(translations.en.account.status.packaged).toBe("Packaged");
    expect(translations.en.account.status["sent-or-waiting"]).toContain("Waiting");
    expect(translations.en.account.status.completed).toBe("Completed");
    expect(translations.en.account.status.cancelled).toContain("Cancelled");
    expect(translations.en.account.status.aborted).toContain("Aborted");
  });

  it("includes Wizards (MTG), Riot (Riftbound), Loyalty, Notifications, and Third-Party translations in both en and he", () => {
    expect(translations.en.gaming.wizardsLabel).toContain("Wizards");
    expect(translations.en.gaming.riotLabel).toContain("Riot");
    expect(translations.en.loyalty.title).toContain("Loyalty");
    expect(translations.he.loyalty.title).toContain("פרימיום");
    expect(translations.en.notifications.restockAlerts).toContain("Restock");
    expect(translations.en.thirdParty.googleBtn).toContain("Google");
  });

  it("contains zero technical stack mentions (Next.js, MongoDB, shadcn, Docker) in customer UI copy", () => {
    const serialized = JSON.stringify(translations);
    expect(serialized).not.toContain("Next.js");
    expect(serialized).not.toContain("MongoDB");
    expect(serialized).not.toContain("shadcn");
    expect(serialized).not.toContain("Docker");
  });

  it("exports Dockside Keep official contact points and social URLs", () => {
    expect(STORE_CONTACT.phone).toEqual({
      CountryCodeAlpha3: "ISR",
      PhoneNumber: "053-774-6837",
    });
    expect(STORE_CONTACT.email).toBe("israelttgcenter@gmail.com");
    expect(STORE_CONTACT.address).toMatchObject({
      StreetName: "הרץ",
      BuildingNumber: "3",
      TownName: "Haifa",
      PostalCode: "3223201",
      CountryCodeAlpha3: "ISR",
    });
    expect(STORE_CONTACT.instagram).toBe(
      "https://www.instagram.com/docksidekeep/"
    );
    expect(STORE_CONTACT.facebook).toBe(
      "https://www.facebook.com/p/Dockside-Keep-61572337803379/"
    );
    expect(STORE_CONTACT.geekguild).toBe(
      "https://geekguild.co.il/shops/dockside-keep-haifa"
    );
    expect(STORE_CONTACT.mydecklist).toBe(
      "https://mydecklist.app/events/paper/store/dockside-keep-haifa-israel"
    );
    expect(STORE_CONTACT.googleMaps).toBe(
      "https://share.google/kCeQ9Xp86GpTa5We3"
    );
  });

  it("returns localized titles, descriptions, categories, and badges for en and he and keeps INITIAL_ITEMS empty", () => {
    expect(INITIAL_ITEMS).toEqual([]);
    const sampleItem = {
      slug: "sample-board-game",
      type: "board-game" as const,
      title: "Sample Strategy Game",
      title_he: "משחק אסטרטגיה לדוגמה",
      money: { price: 180, currencyId: "ILS" },
      category: "Store Items",
      badge: "Bestseller",
      badge_he: "רב-מכר",
      description: "Strategic tabletop board game.",
      description_he: "משחק קופסה אסטרטגי.",
      inStock: true,
      quantity: 5,
    };
    expect(getLocalizedTitle(sampleItem, "en")).toContain("Sample Strategy");
    expect(getLocalizedTitle(sampleItem, "he")).toContain("משחק אסטרטגיה");

    expect(getLocalizedDescription(sampleItem, "en")).toContain("Strategic");
    expect(getLocalizedDescription(sampleItem, "he")).toContain("משחק קופסה");

    expect(getLocalizedBadge(sampleItem, "en")).toBe("Bestseller");
    expect(getLocalizedBadge(sampleItem, "he")).toBe("רב-מכר");

    expect(getLocalizedCategory("Store Items", "en")).toBe("Store Items");
    expect(getLocalizedCategory("Store Items", "he")).toBe("מוצרי החנות");
  });

  it("formats Money and merges Tailwind classes", () => {
    expect(formatMoney(normalizeMoney(180, "ILS"))).toBe("₪180");
    expect(cn("p-2 text-sm", "p-4")).toBe("text-sm p-4");
  });
});
