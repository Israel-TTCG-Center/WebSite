import { test, expect } from "@playwright/test";

test.describe("02. Customer Storefront, Events, Contact, Blog & SEO Verification", () => {
  test("Storefront Filters, Item Lifecycle Badges, Public Blog, Contact & SEO Metadata", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("store-header")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const homeTitle = await page.title();
    expect(homeTitle.length).toBeGreaterThan(10);
    expect(homeTitle.length).toBeLessThan(60);
    const homeDesc = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect((homeDesc || "").length).toBeGreaterThanOrEqual(150);
    expect((homeDesc || "").length).toBeLessThanOrEqual(160);
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    await expect(page.getByTestId("footer-instagram")).toBeVisible();
    await expect(page.getByTestId("footer-facebook")).toBeVisible();
    await expect(page.getByTestId("footer-geekguild")).toHaveAttribute(
      "href",
      "https://geekguild.co.il/shops/dockside-keep-haifa"
    );
    await expect(page.getByTestId("footer-mydecklist")).toHaveAttribute(
      "href",
      "https://mydecklist.app/events/paper/store/dockside-keep-haifa-israel"
    );
    await expect(page.getByTestId("footer-google-nav")).toHaveAttribute(
      "href",
      "https://share.google/kCeQ9Xp86GpTa5We3"
    );

    // Contact page
    await page.getByTestId("nav-contact").click();
    await expect(page).toHaveURL(/\/contact/);
    await expect(page.getByTestId("contact-google-nav")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    // Public /blog page & pagination
    await page.getByTestId("nav-blog").click();
    await expect(page).toHaveURL(/\/blog/);
    await expect(page.getByTestId("blog-page")).toBeVisible();
    await expect(page.getByTestId("blog-pagination")).toBeVisible();

    const pagedItemsRes = await request.get("/api/items?page=1&pageSize=2");
    expect(pagedItemsRes.ok()).toBe(true);
    const pagedItemsJson = await pagedItemsRes.json();
    expect(pagedItemsJson.pagination.currentPage).toBe(1);
    expect(pagedItemsJson.pagination.pageSize).toBe(2);

    const pagedEventsRes = await request.get("/api/events?page=1&pageSize=5");
    expect(pagedEventsRes.ok()).toBe(true);
    const pagedEventsJson = await pagedEventsRes.json();
    expect(pagedEventsJson.pagination.currentPage).toBe(1);

    // Click blog post card -> /blog/[slug]
    await expect(
      page.getByTestId("blog-post-commander-deckbuilding-guide")
    ).toBeVisible();
    await page.getByTestId("blog-post-commander-deckbuilding-guide").click();
    await expect(page).toHaveURL(/\/blog\/commander-deckbuilding-guide/);
    await expect(page.getByTestId("blog-post-detail")).toBeVisible();
    await page.getByTestId("back-to-blog").click();
    await expect(page).toHaveURL(/\/blog$/);

    // Non-admins cannot POST to /api/blog
    const unauthorizedBlogRes = await request.post("/api/blog", {
      data: {
        slug: "unauthorized-user-post",
        title: "Unauthorized Post",
        content: "Should be blocked",
      },
    });
    expect(unauthorizedBlogRes.status()).toBe(401);

    // Sub-admin RBAC verification
    const subLoginRes = await request.post("/api/admin", {
      data: { username: "event_staff", password: "staff-pass-2026" },
    });
    expect(subLoginRes.ok()).toBe(true);
    const subLoginData = await subLoginRes.json();
    expect(subLoginData.admin.role).toBe("support");
    expect(subLoginData.admin.level).toBe(30);

    const subTryCreateAdmin = await request.put("/api/admin", {
      headers: { "x-admin-token": subLoginData.adminToken },
      data: { username: "rogue_admin", password: "123", role: "manager" },
    });
    expect(subTryCreateAdmin.status()).toBe(403);

    // Storefront filters & item lifecycle badges
    await page.goto("/");
    await expect(
      page.getByTestId("filter-show-out-of-stock")
    ).not.toBeChecked();
    await expect(page.getByTestId("store-category-filters")).toBeVisible();

    await page.getByTestId("store-filter-max-price").fill("155");
    await expect(
      page.getByTestId("card-catan-strategy-board-game")
    ).toBeVisible();
    await expect(page.getByTestId("card-terraforming-mars")).toHaveCount(0);
    await page.getByTestId("store-filter-max-price").fill("");

    // Catan shows Pre-Order Price (₪150) alongside crossed-out Regular Price (₪180)
    await expect(
      page.getByTestId("price-catan-strategy-board-game")
    ).toHaveText("₪150");
    await expect(
      page.getByTestId("regular-price-catan-strategy-board-game")
    ).toHaveText("₪180");

    // Catan Seafarers has wontBeStocked = true with stock > 0 -> shows "Final Stock — Won't Be Restocked" while Regular
    await expect(page.getByTestId("card-catan-seafarers-csv")).toBeVisible();
    await expect(
      page.getByTestId("wontberestocked-badge-catan-seafarers-csv")
    ).toBeVisible();

    // Hidden item is never visible on storefront
    await expect(
      page.getByTestId("card-secret-unrevealed-vault")
    ).toHaveCount(0);

    await page.screenshot({
      path: "test-results/visual/1-storefront-en-dark.png",
      fullPage: true,
    });

    // Item Detail Page -> Pre-Order badge, localized UTC time, and hidden internal keys
    await page.goto("/items/catan-strategy-board-game");
    await expect(page.getByTestId("detail-preorder-badge")).toBeVisible();
    await expect(page.getByTestId("spec-row-isHidden")).toHaveCount(0);
    await expect(page.getByTestId("spec-row-wontBeStocked")).toHaveCount(0);
    await expect(page.getByTestId("spec-row-lifecycleStage")).toHaveCount(0);

    // Events page
    await page.getByTestId("nav-events").click();
    await expect(
      page.getByTestId("card-friday-night-tcg-championship-ticket")
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/visual/2-events-page.png",
      fullPage: true,
    });

    // Switch to Hebrew (RTL) & capture screenshot
    await page.goto("/");
    await page.getByTestId("lang-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({
      path: "test-results/visual/3-storefront-he-rtl.png",
      fullPage: true,
    });
    await page.getByTestId("lang-toggle").click();
  });
});
