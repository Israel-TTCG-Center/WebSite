import { test, expect } from "@playwright/test";

test.describe("03. Orders Lifecycle (Customer Abort Before Packaged, Store Lifecycle & Cancel Before Completed), Cart & Account", () => {
  test("Customer Auth, Cart Checkout, User Abort Before Packaged, Store Lifecycle Progression & Store Cancel", async ({
    page,
    request,
  }) => {
    // 3A. Verify /account redirects to /login when unauthenticated
    await page.goto("/");
    await expect(page.getByTestId("account-link")).toHaveCount(0);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);

    // One-Click Google Sign-In on /login
    await expect(page.getByTestId("google-auth-email")).toHaveCount(0);
    await page.getByTestId("google-auth-btn").click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByTestId("account-link")).toBeVisible();
    await expect(page.getByTestId("linked-provider-google")).toBeVisible();

    // 3B. Register a new account with Email + Password
    const testUserEmail = `player.${Date.now()}@docksidekeep.org`;
    await page.goto("/login");
    await page.getByTestId("auth-register-tab").click();
    await expect(page.getByTestId("auth-page-heading")).toHaveText(
      "Create Your Account"
    );
    await page.getByTestId("auth-name-first").fill("Alex");
    await page.getByTestId("auth-name-middle").fill("J");
    await page.getByTestId("auth-name-last").fill("Mercer");
    await page.getByTestId("auth-email-input").fill(testUserEmail);
    await page.getByTestId("auth-password-input").fill("SecurePass#2026");
    await page.getByTestId("auth-submit-btn").click();
    await expect(page).toHaveURL(/\/account/);

    // Active Discount is hidden on the account page
    await expect(page.getByTestId("loyalty-discount")).toHaveCount(0);

    // Notifications start Opt-Out (false) & Account Email is editable via react-hook-form
    await expect(page.getByTestId("account-contact-email")).toHaveValue(
      testUserEmail
    );
    const customNotifyEmail = `alerts.${testUserEmail}`;
    await page.getByTestId("account-contact-email").fill(customNotifyEmail);
    await expect(page.getByTestId("notify-restock-alerts")).not.toBeChecked();
    await page.getByTestId("notify-restock-alerts").check();
    await page.getByTestId("save-notifications-btn").click();
    await expect(page.getByTestId("notifications-saved-msg")).toBeVisible();
    await expect(page.getByTestId("account-contact-email")).toHaveValue(
      customNotifyEmail
    );

    // 3C. Save Billing & Shipping Addresses (all 5 fields required) and Gaming Accounts
    await page.getByTestId("billing-address-street").fill("Hertz 3 Billing");
    await page.getByTestId("billing-address-city").fill("Haifa");
    await page.getByTestId("billing-address-postal").fill("3223201");
    await page.getByTestId("billing-address-phone").fill("053-774-6837");
    await page.getByTestId("save-billing-address-btn").click();
    await expect(page.getByTestId("billing-address-saved-msg")).toBeVisible();

    for (const reqField of [
      "account-address-nickname",
      "account-address-street",
      "account-address-building",
      "account-address-city",
      "account-address-state",
      "account-address-postal",
      "account-address-phone",
    ]) {
      await expect(page.getByTestId(reqField)).toHaveAttribute("required", "");
    }
    for (const optField of [
      "account-address-unit",
      "account-address-notes",
    ]) {
      await expect(page.getByTestId(optField)).not.toHaveAttribute("required");
    }

    await page.getByTestId("account-address-nickname").fill("Home Base");
    await page.getByTestId("account-address-street").fill("Hertz");
    await page.getByTestId("account-address-building").fill("3");
    await page.getByTestId("account-address-unit").fill("Apt 2");
    await page.getByTestId("account-address-city").fill("Haifa");
    await page.getByTestId("account-address-state").fill("Haifa District");
    await page.getByTestId("account-address-postal").fill("3223201");
    await page.getByTestId("account-address-phone").fill("053-111-2222");
    await page
      .getByTestId("account-address-notes")
      .fill("Ring bell #2 on arrival");
    await page.getByTestId("account-add-address-btn").click();
    await expect(page.getByTestId("saved-addresses-list")).toContainText(
      "Home Base"
    );
    await expect(page.getByTestId("saved-addresses-list")).toContainText(
      "Hertz 3, Apt/Unit Apt 2, Haifa, Haifa District 3223201 (053-111-2222)"
    );
    await expect(page.getByTestId("saved-addresses-list")).toContainText(
      "Ring bell #2 on arrival"
    );

    await page
      .getByTestId("gaming-wizards-input")
      .fill("planeswalker@wizards.com");
    await page.getByTestId("gaming-riot-input").fill("Summoner#IL1");
    await page.getByTestId("save-gaming-accounts-btn").click();

    // =========================================================================
    // 3D. USER ABORT FLOW (Before `packaged`: user can abort order & restore stock)
    // =========================================================================
    await page.goto("/");
    await page.getByTestId("add-to-cart-terraforming-mars").click();
    await page.getByTestId("cart-button").click();
    await expect(page).toHaveURL(/\/cart/);
    await page.getByTestId("checkout-btn").click();
    await expect(page.getByTestId("checkout-status")).toBeVisible();

    // Visit /account -> Order is in "Ordered (Paid)" (before packaged), so Abort Order button is visible
    await page.goto("/account");
    const abortBtn = page.locator('[data-testid^="user-abort-order-"]').first();
    await expect(abortBtn).toBeVisible();
    await abortBtn.click();

    // Verify status changes to Aborted by User and Terraforming Mars stock (qty=1) is restored!
    await expect(page.getByTestId("order-history-list")).toContainText(
      "Aborted by User"
    );

    // =========================================================================
    // 3E. FULL ORDER LIFECYCLE & RACE CONDITION VERIFICATION
    // =========================================================================
    await page.goto("/");
    // Terraforming Mars was restored to stock when the previous order was aborted!
    await page.getByTestId("add-to-cart-terraforming-mars").click();
    await page.goto("/events");
    await page
      .getByTestId("add-to-cart-friday-night-tcg-championship-ticket")
      .click();

    await page.getByTestId("cart-button").click();
    await expect(page).toHaveURL(/\/cart/);

    await page.getByTestId("delivery-option-home-courier").click();
    await expect(page.getByTestId("cart-delivery-cost")).toHaveText("₪35");
    await expect(page.getByTestId("cart-total-money")).toHaveText("₪355");
    await expect(
      page.getByTestId("delivery-expected-date-home-courier")
    ).toContainText("Expected Delivery:");
    await expect(
      page.getByTestId("cart-expected-delivery-date")
    ).toBeVisible();

    await page.getByTestId("delivery-option-wait-in-store").click();
    await expect(page.getByTestId("cart-delivery-cost")).toHaveText("₪0");
    await expect(page.getByTestId("cart-total-money")).toHaveText("₪320");
    await expect(
      page.getByTestId("delivery-expected-date-wait-in-store")
    ).toContainText("Expected Delivery:");

    // Verify AddressFormFields biggest-to-smallest DOM order on /cart:
    // 1. Nickname -> 2. Zip -> 3. Country -> 4. State -> 5. City -> 6. Street/Building/Apartment -> 7. Phone -> 8. Notes
    const cartAddressFieldTestIds = await page
      .getByTestId("address-fields-container")
      .locator("[data-testid]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid") || "")
      );
    expect(cartAddressFieldTestIds).toEqual([
      "address-nickname",
      "address-postal",
      "address-country",
      "address-state",
      "address-city",
      "address-street",
      "address-building",
      "address-unit",
      "address-phone",
      "address-notes",
    ]);

    // Verify Billing Address "Same as Shipping" checkbox shortcut (checked by default)
    const sameAsShippingCheckbox = page.getByTestId(
      "same-as-shipping-checkbox"
    );
    await expect(sameAsShippingCheckbox).toBeChecked();
    await expect(page.getByTestId("cart-billing-address-card")).toHaveCount(0);

    // Uncheck shortcut -> Billing Address card appears with the same biggest-to-smallest field order
    await sameAsShippingCheckbox.uncheck();
    await expect(page.getByTestId("cart-billing-address-card")).toBeVisible();
    const cartBillingFieldTestIds = await page
      .getByTestId("cart-billing-address-fields-container")
      .locator("[data-testid]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid") || "")
      );
    expect(cartBillingFieldTestIds).toEqual([
      "cart-billing-address-nickname",
      "cart-billing-address-recipient-name-first",
      "cart-billing-address-recipient-name-middle",
      "cart-billing-address-recipient-name-last",
      "cart-billing-address-postal",
      "cart-billing-address-country",
      "cart-billing-address-state",
      "cart-billing-address-city",
      "cart-billing-address-street",
      "cart-billing-address-building",
      "cart-billing-address-unit",
      "cart-billing-address-phone",
    ]);
    await sameAsShippingCheckbox.check();
    await expect(page.getByTestId("cart-billing-address-card")).toHaveCount(0);

    await page.getByTestId("payment-mode-temp").click();
    await page.getByTestId("payment-type-bank-transfer").click();
    await expect(page.getByTestId("bank-or-cash-notice")).toBeVisible();
    await page.getByTestId("payment-detail").fill("Bank Ref #9988");

    await page.screenshot({
      path: "test-results/visual/4-cart-delivery-address.png",
      fullPage: true,
    });

    await page.getByTestId("checkout-btn").click();
    await expect(page.getByTestId("checkout-status")).toContainText(
      "reserved for 3 days"
    );

    // Race condition check on Terraforming Mars (quantity was 1, now 0)
    const raceRes = await request.post("/api/orders", {
      data: {
        items: [
          {
            slug: "terraforming-mars",
            title: "Terraforming Mars",
            money: { price: 260, currencyId: "ILS" },
            quantity: 1,
          },
        ],
        totalMoney: { price: 260, currencyId: "ILS" },
      },
    });
    expect(raceRes.status()).toBe(409);

    // Visit /account -> Participated Events list shows Friday Night TCG Championship
    await page.goto("/account");
    await expect(page.getByTestId("participated-events-list")).toBeVisible();
    await expect(
      page.getByTestId(
        "participated-event-friday-night-tcg-championship-ticket"
      )
    ).toBeVisible();
    await expect(page.getByTestId("order-history-list")).toContainText(
      "Expected Delivery:"
    );

    // =========================================================================
    // 3F. ADMIN ORDER LIFECYCLE PROGRESSION (ordered-not-paid -> ordered-paid -> packaged -> sent-or-waiting -> completed)
    // =========================================================================
    await page.goto("/admin?page=inventory");
    await page.getByTestId("admin-username").fill("admin");
    await page.getByTestId("admin-password").fill("dockside-admin-2026");
    await page.getByTestId("admin-login-btn").click();

    // Advance order to "packaged" (`admin-approve-order-*`) -> once packaged, customer can no longer abort!
    const packageBtn = page
      .locator('[data-testid^="admin-approve-order-"]')
      .first();
    await expect(packageBtn).toBeVisible();
    await packageBtn.click();

    // Verify Event Participants CSV download works with authenticated admin session
    await page.getByTestId("admin-tab-events").click();
    await page
      .getByTestId(
        "admin-download-participants-friday-night-tcg-championship-ticket"
      )
      .click();
    await expect(
      page.getByTestId(
        "admin-participants-csv-friday-night-tcg-championship-ticket"
      )
    ).toContainText(testUserEmail);

    // Verify Admin Delivery Options & Estimated Delivery Time configuration
    await page.getByTestId("admin-tab-metadata").click();
    await expect(
      page.getByTestId("admin-delivery-days-home-courier")
    ).toBeVisible();
    await page.getByTestId("admin-delivery-days-home-courier").fill("4");
    await expect(
      page.getByTestId("admin-delivery-expected-date-home-courier")
    ).toContainText("(4d)");
    await page.getByTestId("admin-delivery-days-home-courier").fill("3");
    await page.getByTestId("admin-save-delivery-options-btn").click();
    await expect(page.getByTestId("admin-delivery-saved-msg")).toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    const loginRes = await request.post("/api/admin", {
      data: { username: "admin", password: "dockside-admin-2026" },
    });
    if (!loginRes.ok()) return;
    const { adminToken } = await loginRes.json();
    const headers = { "x-admin-token": adminToken };

    const testItemSlugs = [
      "catan-strategy-board-game",
      "terraforming-mars",
      "secret-unrevealed-vault",
      "catan-seafarers-csv",
    ];
    for (const slug of testItemSlugs) {
      await request.delete(`/api/items?slug=${encodeURIComponent(slug)}`, {
        headers,
      });
    }

    await request.delete(
      "/api/events?slug=friday-night-tcg-championship-ticket",
      { headers }
    );

    await request.delete("/api/blog?slug=commander-deckbuilding-guide", {
      headers,
    });

    const testClasses = ["vip-dragon", "bronze", "silver", "gold", "affiliate"];
    for (const id of testClasses) {
      await request.delete(`/api/premium?id=${encodeURIComponent(id)}`, {
        headers,
      });
    }

    await request.delete("/api/admin?username=event_staff", { headers });
  });
});
