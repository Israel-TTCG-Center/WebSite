# Architecture Decision Records (ADRs) & Mandatory Constraints

This document records the core architectural decisions and **strict constraints** of **Dockside Keep**. Every developer and AI agent modifying this codebase must follow these rules.

---

## ADR-01: Zero Database Wiping & Zero Dummy/Initial Data Seeding

- **Decision**: The application must **never** delete, drop, or wipe MongoDB collections on startup, restart, or deployment, and must **never** seed dummy, mock, or initial catalog items, events, metadata, or premium classes into the database.
- **Implementation**:
  - `INITIAL_ITEMS` in [`src/lib/mongodb.ts`](../src/lib/mongodb.ts) is an empty array (`[]`).
  - `getDb()` only ensures collection indexes (`ensureDbIndexes`) and the root owner admin account (`process.env.ADMIN_USERNAME || "admin"`) exist.
  - Playwright E2E tests in [`tests/e2e/storefront.spec.ts`](../tests/e2e/storefront.spec.ts) clean up the exact test slugs they create inside a `test.afterAll` hook so no test artifacts remain in MongoDB.

---

## ADR-02: Auth0 Delegation & Salted `scrypt` Password Verifiers

- **Decision**: Never store plaintext passwords in MongoDB (`users` or `admins`). Delegate identity verification to Auth0 (`verifyThirdPartyIdentity` and `verifyAuth0AdminIdentity` in [`src/lib/auth-security.ts`](../src/lib/auth-security.ts)) and store only salted cryptographic `scrypt` verifiers (`scrypt$<saltHex>$<derivedKeyHex>`) for password-based accounts.
- **Implementation**:
  - `hashPasswordScrypt` uses 16-byte cryptographic random salts (`N=16384, r=8, p=1, keylen=64`).
  - `verifyPasswordScrypt` compares derived keys in constant time using `crypto.timingSafeEqual`.
  - `sanitizeAuditValue` in [`src/lib/admin.ts`](../src/lib/admin.ts) redacts both `password` and `passwordHash` (`"[REDACTED]"`) before writing to `admin_audit_logs` or shipping logs to Grafana Loki.

---

## ADR-03: One-Click Google Sign-In & Automatic Newsletter Email Binding

- **Decision**:
  1. When signing in or linking with Google, users must **not** be asked to type an email address manually—the verified email from their Google account is used automatically.
  2. For both Google sign-in and Email + Password registration (`"Create Your Account"`), the user's account email (`user.email`) is automatically bound as their `contactEmail` for newsletters, restock alerts, and order status updates.
  3. All notification checkboxes (`restockAlerts`, `orderStatus`, `newsletterArrivals`) default to **Opt-Out (`false`)** on new accounts.

---

## ADR-04: Protected `/account` Route When Signed Out

- **Decision**: `http://localhost:3000/account` must not be accessible when the visitor is not signed in.
- **Implementation**:
  - `CartContext` exposes `authHydrated: boolean`.
  - In [`src/app/account/page.tsx`](../src/app/account/page.tsx), when `authHydrated && !user`, the router immediately redirects to `/login` (`router.replace("/login")`) and the component renders `null`.
  - In [`src/components/Navbar.tsx`](../src/components/Navbar.tsx), the `/account` link (`data-testid="account-link"`) is rendered only when `user` is non-null.

---

## ADR-05: UTC-Everywhere Storage + Browser-Locale Rendering

- **Decision**: All dates and timestamps stored in MongoDB or exchanged in JSON APIs must be **UTC ISO-8601 strings** (`createdAtUtc`, `updatedAtUtc`, `revealAtUtc`, `preOrderAtUtc`, `regularSaleAtUtc`, `expiresAtUtc`). When displayed to users in the browser, ISO timestamps must be formatted into the visitor's local browser timezone and locale.
- **Implementation**:
  - `toUtcIso()` and `nowUtcIso()` in [`src/lib/premium.ts`](../src/lib/premium.ts) normalize dates to UTC ISO-8601.
  - `<LocalizedTime value={utcIso} />` in [`src/components/ui/localized-time.tsx`](../src/components/ui/localized-time.tsx) renders a semantic `<time dateTime={utcIso}>` element whose visible text is formatted via `Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })`.

---

## ADR-06: Immutable Item Titles After Creation & Missing-Fields Alert

- **Decision**:
  1. Once a store item or event is created (`POST /api/items`), its `title` and `title_he` are **locked** and cannot be modified via `PATCH /api/items` (only price, pre-order price, stock quantity, descriptions, release schedule, and event capacity can be updated).
  2. Legacy database documents missing newer schema fields are normalized safely at read time by `normalizeDoc()`, and their missing field names are listed in `item.missingFields` so the Admin Portal displays a backward-compatibility warning banner (`missing-fields-alert`).

---

## ADR-07: Bilingual (`en` LTR / `he` RTL), Accessibility (WAI-ARIA), SEO & Clean UI Copy

- **Decision**:
  1. Every customer and admin view supports instant switching between **English (`dir="ltr"`)** and **Hebrew (`dir="rtl"`)** as well as **Dark** and **Light** themes.
  2. Every page renders semantic HTML5 landmarks (`<header>`, `<nav>`, `<main id="main-content">`, `<section>`, `<article>`, `<footer>`), a **single `<h1>`** (`<PageHeader>`), unique `<title>` (`< 60` chars) and `<meta name="description">` (`150–160` chars), and Schema.org JSON-LD (`Store`, `Product`, `Event`, `BlogPosting`).
  3. Product specification tables on `/items/[slug]` must **never** expose internal database flags (`isHidden`, `kind`, `saleStage`, `availabilityMode`, `missingFields`, `createdAtUtc`, `updatedAtUtc`, `revealAtUtc`), and the Pre-Order badge (`detail-preorder-badge`) is shown **only** when `saleStage === "pre-order"`.
  4. Customer and admin translation strings in [`src/lib/i18n.ts`](../src/lib/i18n.ts) must **never** contain technical stack terms (`Next.js`, `MongoDB`, `shadcn`, `Docker`).
