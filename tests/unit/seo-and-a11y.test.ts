import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PAGE_SEO_CONFIG,
  buildBlogPostMetadata,
  buildBlogPostingJsonLd,
  buildEventJsonLd,
  buildPageMetadata,
  buildProductJsonLd,
  buildProductMetadata,
  buildStoreJsonLd,
  clampSeoDescription,
  clampSeoTitle,
} from "@/lib/seo";
import {
  computeExpectedDeliveryUtc,
  formatExpectedDeliveryDate,
  normalizeDeliveryOptions,
} from "@/lib/premium";
import {
  emitOtelLog,
  formatOtelPrometheus,
  generateTraceContext,
  getOtelSnapshot,
  incrementOtelCounter,
  recordErrorInvestigation,
  recordFeatureUsage,
  recordOtelTraceSpan,
} from "@/lib/otel";

describe("SEO Metadata, Schema.org JSON-LD, OpenTelemetry & Accessibility Static Analysis", () => {
  it("enforces unique titles (< 60 chars), descriptions (150-160 chars), and absolute canonical URLs across all pages", () => {
    const entries = Object.values(PAGE_SEO_CONFIG);
    expect(entries.length).toBeGreaterThanOrEqual(8);

    const titles = new Set<string>();
    const descriptions = new Set<string>();
    const canonicals = new Set<string>();

    for (const entry of entries) {
      expect(entry.title.length).toBeGreaterThan(10);
      expect(entry.title.length).toBeLessThan(60);

      expect(entry.description.length).toBeGreaterThanOrEqual(150);
      expect(entry.description.length).toBeLessThanOrEqual(160);

      expect(entry.canonicalUrl).toMatch(/^https:\/\/[^?]+$/);

      titles.add(entry.title);
      descriptions.add(entry.description);
      canonicals.add(entry.canonicalUrl);

      const meta = buildPageMetadata(entry.key);
      expect(meta.title).toBe(entry.title);
      expect(meta.description).toBe(entry.description);
      expect(meta.alternates?.canonical).toBe(entry.canonicalUrl);
    }

    expect(titles.size).toBe(entries.length);
    expect(descriptions.size).toBe(entries.length);
    expect(canonicals.size).toBe(entries.length);
  });

  it("clamps dynamic product titles (< 60 chars) and descriptions (150-160 chars) with absolute canonical URLs", () => {
    const meta = buildProductMetadata({
      slug: "sample-board-game",
      title: "Sample Strategy Board Game",
      description: "Strategic tabletop board game.",
      category: "Store Items",
      priceNis: 180,
    });

    expect(String(meta.title || "").length).toBeLessThan(60);
    expect(String(meta.description || "").length).toBeGreaterThanOrEqual(150);
    expect(String(meta.description || "").length).toBeLessThanOrEqual(160);
    expect(String(meta.alternates?.canonical || "")).toBe(
      "https://docksidekeep.co.il/items/sample-board-game"
    );

    const longTitle = clampSeoTitle(
      "Ultra Rare Collector Edition Commander Anthology Box Set With Bonus Foil Tokens and Playmat"
    );
    expect(longTitle.length).toBeLessThan(60);

    const shortDesc = clampSeoDescription("Short description.");
    expect(shortDesc.length).toBeGreaterThanOrEqual(150);
    expect(shortDesc.length).toBeLessThanOrEqual(160);

    const longDesc = clampSeoDescription("A".repeat(350));
    expect(longDesc.length).toBeGreaterThanOrEqual(150);
    expect(longDesc.length).toBeLessThanOrEqual(160);
  });

  it("generates Schema.org JSON-LD structured data for HobbyShop, Product, Event, and BlogPosting", () => {
    const storeLd = buildStoreJsonLd();
    expect(storeLd["@context"]).toBe("https://schema.org");
    expect(storeLd["@type"]).toBe("HobbyShop");
    expect(storeLd.address.addressLocality).toBe("Haifa");
    expect(storeLd.sameAs.length).toBeGreaterThanOrEqual(4);

    const productLd = buildProductJsonLd({
      slug: "catan-strategy-board-game",
      title: "Catan: Strategy Board Game",
      priceNis: 155,
      availabilityMode: "pre_order",
    });
    expect(productLd["@type"]).toBe("Product");
    expect(productLd.offers["@type"]).toBe("Offer");
    expect(productLd.offers.price).toBe(155);
    expect(productLd.offers.priceCurrency).toBe("ILS");
    expect(productLd.offers.availability).toBe("https://schema.org/PreOrder");

    const eventLd = buildEventJsonLd({
      slug: "friday-night-tcg-championship-ticket",
      title: "Friday Night TCG Championship",
      priceNis: 60,
    });
    expect(eventLd["@type"]).toBe("Event");
    expect(eventLd.location.name).toBe("Dockside Keep");

    const blogLd = buildBlogPostingJsonLd({
      slug: "commander-deckbuilding-guide",
      title: "Commander Deckbuilding Guide",
      content: "Full strategy article body",
    });
    expect(blogLd["@type"]).toBe("BlogPosting");
    expect(blogLd.headline).toBe("Commander Deckbuilding Guide");
    expect(blogLd.mainEntityOfPage["@id"]).toBe(
      "https://docksidekeep.co.il/blog/commander-deckbuilding-guide"
    );

    const blogMeta = buildBlogPostMetadata({
      slug: "commander-deckbuilding-guide",
      title: "Commander Deckbuilding Guide",
      content: "Full strategy article body",
      author: "admin",
    });
    expect(String(blogMeta.title || "").length).toBeLessThan(60);
    expect(String(blogMeta.description || "").length).toBeGreaterThanOrEqual(
      150
    );
    expect(String(blogMeta.description || "").length).toBeLessThanOrEqual(160);
    expect(blogMeta.alternates?.canonical).toBe(
      "https://docksidekeep.co.il/blog/commander-deckbuilding-guide"
    );
  });

  it("generates W3C trace contexts, emits OpenTelemetry logs, and formats Prometheus metrics", async () => {
    const ctx = generateTraceContext();
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);

    await incrementOtelCounter(null, "dockside_http_requests_total", 2);
    await recordFeatureUsage(null, "cart_checkout", { test: true });
    await recordOtelTraceSpan(null, {
      operation: "test.span",
      durationMs: 12,
      status: "OK",
    });
    await recordErrorInvestigation(null, {
      route: "/api/orders",
      httpStatus: 409,
      error: "ITEM_OUT_OF_STOCK",
    });
    const logRec = await emitOtelLog(null, {
      severityText: "INFO",
      category: "test.otel",
      body: "Unit test OpenTelemetry log record",
    });
    expect(logRec.serviceName).toBe("dockside-keep-web");
    expect(logRec.traceId).toHaveLength(32);

    const snapshot = await getOtelSnapshot(null, 10);
    const promText = formatOtelPrometheus(snapshot);
    expect(promText).toContain("dockside_http_requests_total");
    expect(promText).toContain("dockside_admin_audit_logs_total");
    expect(promText).toContain("dockside_feature_usage_total");
    expect(promText).toContain("dockside_feature_errors_total");
    expect(promText).toContain('service_name="dockside-keep-web"');
  });

  it("statically lints source files for semantic HTML5 landmarks, single <h1> hierarchy, img alt text, WAI-ARIA attributes, and required project files", () => {
    const rootDir = process.cwd();
    const readSrc = (relPath: string) =>
      fs.readFileSync(path.join(rootDir, relPath), "utf8");

    const layoutSrc = readSrc("src/app/layout.tsx");
    const navbarSrc = readSrc("src/components/Navbar.tsx");
    const footerSrc = readSrc("src/components/Footer.tsx");
    const storefrontSrc = readSrc("src/components/StorefrontClient.tsx");
    const itemDetailSrc = readSrc("src/components/ItemDetailClient.tsx");
    const eventsSrc = readSrc("src/components/EventsClient.tsx");
    const blogSrc = readSrc("src/app/blog/page.tsx");
    const blogDetailSrc = readSrc("src/components/BlogPostDetailClient.tsx");
    const contactSrc = readSrc("src/app/contact/page.tsx");
    const cartSrc = readSrc("src/app/cart/page.tsx");
    const accountSrc = readSrc("src/app/account/page.tsx");
    const loginSrc = readSrc("src/app/login/page.tsx");

    expect(layoutSrc).toContain("<main");
    expect(layoutSrc).toContain('id="main-content"');
    expect(layoutSrc).toContain('href="#main-content"');
    expect(navbarSrc).toContain("<header");
    expect(navbarSrc).toContain("<nav");
    expect(footerSrc).toContain("<footer");
    expect(footerSrc).toContain("<address");
    expect(storefrontSrc).toContain("<section");
    expect(storefrontSrc).toContain("<article");
    expect(itemDetailSrc).toContain("<article");
    expect(itemDetailSrc).toContain("<aside");
    expect(eventsSrc).toContain("<section");
    expect(eventsSrc).toContain("<article");
    expect(blogSrc).toContain("<section");
    expect(blogSrc).toContain("<article");
    expect(blogDetailSrc).toContain("<article");

    const pageHeaderSrc = readSrc("src/components/ui/page-header.tsx");
    expect(
      (pageHeaderSrc.match(/<h1\b/g) || []).length
    ).toBeGreaterThanOrEqual(2);

    const singleH1Views = [
      storefrontSrc,
      itemDetailSrc,
      eventsSrc,
      blogSrc,
      blogDetailSrc,
      contactSrc,
      cartSrc,
      accountSrc,
      loginSrc,
    ];
    for (const src of singleH1Views) {
      const h1Matches = src.match(/<h1\b/g) || [];
      const pageHeaderMatches = src.match(/<PageHeader\b/g) || [];
      expect(h1Matches.length + pageHeaderMatches.length).toBe(1);
    }

    for (const src of singleH1Views) {
      const imgTags = src.match(/<img\b[^>]*>/g) || [];
      for (const tag of imgTags) {
        expect(tag).toContain("alt=");
      }
    }

    expect(navbarSrc).toContain("aria-label=");
    expect(navbarSrc).toContain("aria-current=");
    expect(storefrontSrc).toContain('role="search"');
    expect(storefrontSrc).toContain("aria-labelledby=");
    expect(itemDetailSrc).toContain('"isHidden"');
    expect(itemDetailSrc).toContain('"wontBeStocked"');
    expect(itemDetailSrc).toContain('"lifecycleStage"');
    expect(itemDetailSrc).toContain("detail-preorder-badge");
    expect(loginSrc).not.toContain("google-auth-email");
    expect(accountSrc).toContain('router.replace("/login")');

    // Ensure all generic legacy store identifiers have been renamed to 'docksidekeep'
    const forbidden = ["game", "store"].join("");
    for (const rel of [
      "package.json",
      "docker-compose.yml",
      "src/context/ThemeContext.tsx",
      "src/context/LanguageContext.tsx",
      "src/context/CartContext.tsx",
      "src/lib/store.ts",
    ]) {
      expect(readSrc(rel).toLowerCase()).not.toContain(forbidden);
    }

    const eslintMjs = readSrc("eslint.config.mjs");
    expect(eslintMjs).toContain("eslint-config-next");
    expect(eslintMjs).toContain("eslint-config-next/core-web-vitals");
    expect(eslintMjs).toContain("eslint-config-next/typescript");

    expect(fs.existsSync(path.join(rootDir, "public/store-icon.jpg"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(rootDir, "public/favicon.ico"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/app/icon.svg"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/app/apple-icon.tsx"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(rootDir, "src/app/opengraph-image.tsx"))
    ).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/app/manifest.ts"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/app/robots.ts"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/app/sitemap.ts"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "src/instrumentation.ts"))).toBe(
      true
    );

    const themeCtxSrc = readSrc("src/context/ThemeContext.tsx");
    expect(themeCtxSrc).toContain("DOCKSIDE_KEEP_PALETTE");
    expect(themeCtxSrc).toContain("createDocksideMuiTheme");
    expect(themeCtxSrc).toContain("MuiThemeProvider");
    expect(themeCtxSrc).toContain("CssBaseline");
    expect(layoutSrc).toContain("AppRouterCacheProvider");

    const adminSrc = readSrc("src/app/admin/page.tsx");
    for (const formSrc of [accountSrc, loginSrc, cartSrc, adminSrc]) {
      expect(formSrc).toContain("react-hook-form");
      expect(formSrc).toContain("useForm");
    }
    expect(accountSrc).not.toContain('data-testid="loyalty-discount"');
    expect(accountSrc).toContain('notificationsForm.register("contactEmail"');
    expect(accountSrc).toContain("<AddressFormFields");
    expect(cartSrc).toContain("<AddressFormFields");
    expect(cartSrc).toContain('data-testid="same-as-shipping-checkbox"');
    expect(cartSrc).toContain('data-testid="cart-billing-address-card"');

    const addressFieldsSrc = readSrc("src/components/AddressFormFields.tsx");
    const orderedFields = [
      "nickname",
      "PostalCode",
      "CountryCodeAlpha3",
      "CountrySubDivision",
      "TownName",
      "StreetName",
      "BuildingNumber",
      "Apartment",
      "phone.PhoneNumber",
      "deliveryNotes",
    ];
    let lastFieldIdx = -1;
    for (const field of orderedFields) {
      const token =
        field === "phone.PhoneNumber"
          ? `fieldName="${field}"`
          : `form.register("${field}"`;
      expect(addressFieldsSrc).toContain(token);
      const idx = addressFieldsSrc.indexOf(token);
      expect(idx).toBeGreaterThan(lastFieldIdx);
      lastFieldIdx = idx;
    }

    expect(adminSrc).toContain("admin-save-delivery-options-btn");
    expect(adminSrc).toContain("admin-delivery-days-");
    expect(adminSrc).toContain("admin-delivery-active-");
    expect(adminSrc).toContain("admin-new-deliv-days");
    expect(cartSrc).toContain("delivery-expected-date-");
    expect(cartSrc).toContain("cart-expected-delivery-date");
    expect(cartSrc).not.toContain("viewOrderHistory");

    const baseUtc = "2026-10-22T12:00:00.000Z";
    const expectedUtc = computeExpectedDeliveryUtc(4, baseUtc);
    expect(expectedUtc).toBe("2026-10-26T12:00:00.000Z");
    expect(formatExpectedDeliveryDate(expectedUtc)).toBe("2026-10-26");
    expect(formatExpectedDeliveryDate(4, baseUtc)).toBe("2026-10-26");

    const normalizedOpts = normalizeDeliveryOptions(
      [
        {
          id: "wait-in-store",
          label: "Store Pickup",
          label_he: "איסוף עצמי",
          cost: { price: 0, currencyId: "ILS" },
          isStorePickup: true,
          active: false,
          estimatedDays: 0,
        },
        {
          id: "express-courier",
          label: "Express Courier",
          label_he: "שליח מהיר",
          cost: { price: 45, currencyId: "ILS" },
          isStorePickup: false,
          active: false,
          estimatedDays: 2,
        },
      ],
      baseUtc
    );
    // Guarantees at least one option remains active
    expect(normalizedOpts[0].active).toBe(true);
    expect(normalizedOpts[1].estimatedDays).toBe(2);
    expect(normalizedOpts[1].expectedDeliveryAtUtc).toBe(
      "2026-10-24T12:00:00.000Z"
    );
  });
});
