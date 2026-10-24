import { test, expect } from "@playwright/test";

const SAMPLE_SVG_DATA_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><rect width='100%' height='100%' fill='%230f766e'/><text x='50%' y='50%' fill='white' font-size='24' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>Dockside Keep</text></svg>";

test.describe("01. Admin Portal: Logged-In Entity Auth, Split items/events Collections & Item Lifecycle", () => {
  test("Admin Portal: CSV Upload, 7-Stage Item Lifecycle, Separate Events Collection & RBAC", async ({
    page,
    request,
  }) => {
    await page.goto("/admin");

    // Verify dedicated Admin Header is shown on /admin (and regular store header is NOT shown)
    await expect(page.getByTestId("admin-header")).toBeVisible();
    await expect(page.getByTestId("store-header")).toHaveCount(0);

    // Sign in to Admin Portal as Root Owner
    await page.getByTestId("admin-username").fill("admin");
    await page.getByTestId("admin-password").fill("dockside-admin-2026");
    await page.getByTestId("admin-login-btn").click();
    await expect(page.getByTestId("admin-dashboard-title")).toBeVisible();
    await expect(page.getByTestId("admin-current-role-badge")).toContainText(
      "OWNER (Level 100)"
    );

    // Verify Admin Portal supports English & Hebrew (RTL) Language Toggle
    await page.getByTestId("lang-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("admin-dashboard-title")).toContainText(
      "דוקסייד קיפ"
    );
    await page.getByTestId("lang-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    // =========================================================================
    // PAGE 1: INVENTORY (CSV Upload, Item Lifecycle Stages, Edit)
    // =========================================================================
    await expect(page.getByTestId("admin-page-inventory")).toBeVisible();

    // 1A. Bulk CSV Upload for new inventory item
    await page
      .getByTestId("admin-csv-textarea")
      .fill(
        `slug,title,title_he,price,currencyId,quantity,description,imageUrl\ncatan-seafarers-csv,Catan Seafarers Expansion,קטאן יורדי הים,190,ILS,6,Navigate the seas of Catan,${SAMPLE_SVG_DATA_URL}`
      );
    await page.getByTestId("admin-csv-import-btn").click();
    await expect(page.getByTestId("admin-csv-status-msg")).toContainText(
      "Imported 1 items from CSV!"
    );
    await expect(
      page.getByTestId("admin-item-catan-seafarers-csv")
    ).toBeVisible();

    // 1B. Add Catan Store Item with Picture & Pre-Order UTC schedule
    await page.getByTestId("admin-new-slug").fill("catan-strategy-board-game");
    await page
      .getByTestId("admin-new-title")
      .fill("Catan — Base Strategy Game");
    await page
      .getByTestId("admin-new-title-he")
      .fill("קטאן — משחק הבסיס האסטרטגי");
    await page.getByTestId("admin-new-price").fill("180");
    await page.getByTestId("admin-new-preorder-price").fill("150");
    await page.getByTestId("admin-new-quantity").fill("5");
    await page.getByTestId("admin-new-image").fill(SAMPLE_SVG_DATA_URL);
    await page
      .getByTestId("admin-new-desc")
      .fill("Settle the isle of Catan through clever trading and strategy.");
    await page
      .getByTestId("admin-new-reveal-utc")
      .fill("2025-01-01T00:00:00Z");
    await page
      .getByTestId("admin-new-preorder-utc")
      .fill("2025-06-01T00:00:00Z");
    await page
      .getByTestId("admin-new-regular-utc")
      .fill("2099-01-01T00:00:00Z");
    await page.getByTestId("admin-add-item-btn").click();
    await expect(page.getByTestId("admin-new-slug")).toHaveValue("");

    await expect(
      page.getByTestId("admin-item-catan-strategy-board-game")
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-stage-badge-catan-strategy-board-game")
    ).toContainText("Stage: pre-order");
    await expect(
      page.getByTestId("admin-preorder-price-badge-catan-strategy-board-game")
    ).toContainText("₪150");

    // Open Edit Panel on Catan -> verify item name is locked/disabled, edit quantity
    await page.getByTestId("admin-edit-btn-catan-strategy-board-game").click();
    await expect(
      page.getByTestId("admin-edit-locked-title-catan-strategy-board-game")
    ).toBeDisabled();
    await page
      .getByTestId("admin-qty-input-catan-strategy-board-game")
      .fill("7");
    await page.getByTestId("admin-qty-save-catan-strategy-board-game").click();
    await expect(
      page.getByTestId("admin-stock-badge-catan-strategy-board-game")
    ).toContainText("Available: 7");

    // 1C. Add a Hidden Item (isHidden = true) AND missing description/imageUrl -> triggers Backward-Compatibility Alert Panel
    await page.getByTestId("admin-new-slug").fill("secret-unrevealed-vault");
    await page.getByTestId("admin-new-title").fill("Secret Unrevealed Vault");
    await page.getByTestId("admin-new-price").fill("999");
    await page.getByTestId("admin-new-quantity").fill("3");
    await page.getByTestId("admin-new-hidden").check();
    await page.getByTestId("admin-add-item-btn").click();
    await expect(page.getByTestId("admin-new-slug")).toHaveValue("");
    await expect(
      page.getByTestId("admin-stage-badge-secret-unrevealed-vault")
    ).toContainText("Stage: hidden");

    // Verify that ?admin=1 in the URL is NEVER trusted without an authenticated admin header
    const spoofItemsRes = await request.get("/api/items?admin=1");
    expect(spoofItemsRes.ok()).toBe(true);
    const spoofItemsData = await spoofItemsRes.json();
    const hiddenLeaked = (spoofItemsData.items || []).some(
      (i: any) => i.slug === "secret-unrevealed-vault"
    );
    expect(hiddenLeaked).toBe(false);

    // Verify the Admin Missing-Fields Alert Panel flags the missing description & imageUrl
    await expect(page.getByTestId("admin-missing-fields-alert")).toBeVisible();
    await expect(
      page.getByTestId("admin-missing-alert-item-secret-unrevealed-vault")
    ).toContainText("description");

    // 1D. Verify Item Lifecycle Transitions (Won't Be Stocked can be Regular when stock > 0, and transitions to wont-be-stocked when stock = 0)
    await page
      .getByTestId("admin-wont-be-stocked-btn-catan-seafarers-csv")
      .click();
    await expect(
      page.getByTestId("admin-wontbestocked-badge-catan-seafarers-csv")
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-stage-badge-catan-seafarers-csv")
    ).toContainText("Stage: regular");

    // 1E. Add Terraforming Mars with quantity = 1 (for checkout & race condition verification)
    await page.getByTestId("admin-new-slug").fill("terraforming-mars");
    await page.getByTestId("admin-new-title").fill("Terraforming Mars");
    await page
      .getByTestId("admin-new-title-he")
      .fill("יישוב מאדים (Terraforming Mars)");
    await page.getByTestId("admin-new-price").fill("260");
    await page.getByTestId("admin-new-quantity").fill("1");
    await page.getByTestId("admin-new-image").fill(SAMPLE_SVG_DATA_URL);
    await page
      .getByTestId("admin-new-desc")
      .fill("Compete to transform Mars into a habitable planet.");
    await page.getByTestId("admin-new-hidden").uncheck();
    await page.getByTestId("admin-add-item-btn").click();

    await page.screenshot({
      path: "test-results/visual/5-admin-dashboard.png",
      fullPage: true,
    });

    // =========================================================================
    // PAGE 2: EVENTS (Stored in dedicated `events` collection via /api/events)
    // =========================================================================
    await page.getByTestId("admin-nav-events").click();
    await expect(page.getByTestId("admin-page-events")).toBeVisible();

    await page
      .getByTestId("admin-event-slug")
      .fill("friday-night-tcg-championship-ticket");
    await page
      .getByTestId("admin-event-title")
      .fill("Friday Night TCG Championship — Entry Ticket");
    await page
      .getByTestId("admin-event-title-he")
      .fill("כרטיס כניסה — אליפות שישי בערב ב-TCG");
    await page.getByTestId("admin-event-price").fill("60");
    await page.getByTestId("admin-event-quantity").fill("16");
    await page.getByTestId("admin-event-image").fill(SAMPLE_SVG_DATA_URL);
    await page
      .getByTestId("admin-event-desc")
      .fill("Weekly Friday Night TCG tournament in Haifa.");
    await page
      .getByTestId("admin-event-facebook")
      .fill("https://www.facebook.com/p/Dockside-Keep-61572337803379/");
    await page.getByTestId("admin-event-date").fill("Friday, 19:00");
    await page.getByTestId("admin-event-venue").fill("Dockside Keep Main Hall");
    await page.getByTestId("admin-event-min-players").fill("4");
    await page.getByTestId("admin-event-max-players").fill("16");
    await page.getByTestId("admin-event-show-registered").check();
    await page.getByTestId("admin-create-event-btn").click();

    await expect(
      page.getByTestId(
        "admin-event-min-status-friday-night-tcg-championship-ticket"
      )
    ).toContainText("Waiting for Min Players:");

    // Verify event lives in /api/events and NOT in /api/items
    const eventsApiRes = await request.get("/api/events");
    expect(eventsApiRes.ok()).toBe(true);
    const eventsApiData = await eventsApiRes.json();
    expect(
      (eventsApiData.events || []).some(
        (ev: any) => ev.slug === "friday-night-tcg-championship-ticket"
      )
    ).toBe(true);

    const itemsOnlyRes = await request.get("/api/items");
    const itemsOnlyData = await itemsOnlyRes.json();
    expect(
      (itemsOnlyData.items || []).some(
        (it: any) => it.slug === "friday-night-tcg-championship-ticket"
      )
    ).toBe(false);

    // =========================================================================
    // PAGE 3: METADATA, DELIVERY OPTIONS, LOYALTY, BLOG & SUB-ADMIN RBAC
    // =========================================================================
    await page.getByTestId("admin-nav-metadata").click();
    await expect(page.getByTestId("admin-page-metadata")).toBeVisible();

    await expect(
      page.getByTestId("admin-delivery-opt-wait-in-store")
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-delivery-opt-home-courier")
    ).toBeVisible();

    await page.getByTestId("admin-assign-email").fill("guest@local");
    await page.getByTestId("admin-assign-class-select").selectOption("");
    await page.getByTestId("admin-assign-btn").click();

    await page
      .getByTestId("admin-meta-hours")
      .fill("Tue–Sat: 10:00 – 23:00 (Tournament Nights)");
    await page.getByTestId("admin-save-metadata-btn").click();
    await expect(page.getByTestId("admin-metadata-saved-msg")).toBeVisible();

    // Admin-Only Blog Post Creation
    await page
      .getByTestId("admin-blog-slug")
      .fill("commander-deckbuilding-guide");
    await page
      .getByTestId("admin-blog-title")
      .fill("Commander Deckbuilding Guide at Dockside Keep");
    await page
      .getByTestId("admin-blog-title-he")
      .fill("מדריך בניית חפיסות קומנדר בדוקסייד קיפ");
    await page
      .getByTestId("admin-blog-content")
      .fill(
        "Join our weekly Commander nights and refine your 100-card singleton list!"
      );
    await page.getByTestId("admin-blog-image").fill(SAMPLE_SVG_DATA_URL);
    await page.getByTestId("admin-add-blog-btn").click();
    await expect(page.getByTestId("admin-blog-saved-msg")).toBeVisible();
    await expect(
      page.getByTestId("admin-blog-row-commander-deckbuilding-guide")
    ).toBeVisible();

    // Owner Sub-Admin Creation & Privilege Enforcement
    await expect(page.getByTestId("admin-team-card")).toBeVisible();
    await page.getByTestId("subadmin-username").fill("event_staff");
    await page.getByTestId("subadmin-password").fill("staff-pass-2026");
    await page.getByTestId("subadmin-role").selectOption("support");
    await page.getByTestId("create-subadmin-btn").click();
    await expect(page.getByTestId("subadmin-saved-msg")).toContainText(
      "event_staff"
    );
    await expect(
      page.getByTestId("admin-account-row-event_staff")
    ).toContainText("SUPPORT (Level 30)");

    // Immutable Admin Audit Logs & OpenTelemetry card
    await expect(page.getByTestId("admin-audit-logs-card")).toBeVisible();
    await expect(
      page.getByTestId("audit-log-row-catan-strategy-board-game").first()
    ).toBeVisible();
    await expect(page.getByTestId("admin-otel-card")).toBeVisible();
    await expect(page.getByTestId("otel-service-name")).toHaveText(
      "dockside-keep-web"
    );
  });
});
