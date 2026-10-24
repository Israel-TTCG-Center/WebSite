# Architecture & System Flows

This document explains the end-to-end architecture and core runtime flows of **Dockside Keep** (`docksidekeep-website`) for developers and AI agents.

---

## 1. High-Level System Architecture

```mermaid
flowchart LR
  subgraph Client["Browser Client (EN LTR / HE RTL, Dark / Light)"]
    UI["Pages & Components\n(/, /events, /blog, /blog/[slug], /items/[slug], /cart, /account, /login, /admin)"]
    CTX["React Contexts\n(ThemeContext, LanguageContext, CartContext)"]
  end

  subgraph NextServer["Next.js App Router Server (docksidekeep-web:3000)"]
    SSR["Server Components & Metadata\n(next/font, /icon.svg, /favicon.ico, /apple-icon, /sitemap.xml, /robots.txt)"]
    API["REST API Route Handlers\n(/api/items, /api/blog, /api/orders, /api/auth, /api/admin, /api/metadata, /api/premium, /api/telemetry)"]
    AUTH["Auth0 & Scrypt Security Layer\n(src/lib/auth-security.ts, src/lib/admin.ts)"]
    OTEL["OpenTelemetry & Loki Shipper\n(src/instrumentation.ts, src/lib/otel.ts)"]
  end

  subgraph DataAndObs["Docker Persistence & Observability"]
    MONGO[("MongoDB\n(docksidekeep-mongo:27017)")]
    LOKI[("Grafana Loki\n(docksidekeep-loki:3100)")]
    PROM[("Prometheus\n(docksidekeep-prometheus:9090)")]
    GRAF["Grafana Dashboards\n(docksidekeep-grafana:3001)"]
  end

  UI --> CTX
  UI --> SSR
  UI --> API
  SSR --> MONGO
  API --> AUTH
  API --> MONGO
  API --> OTEL
  OTEL -->|Push JSON logs| LOKI
  PROM -->|Scrape /api/telemetry?format=prometheus| API
  GRAF --> PROM
  GRAF --> LOKI
```

---

## 2. Database-Level Filtering, Indexing & Collection Separation (`items` vs. `events`)

Store products and events live in two separate MongoDB collections (`items` and `events`). `src/lib/mongodb.ts` creates collection indexes on startup via `ensureDbIndexes(db)`, automatically migrates any legacy event documents out of `items` into `events`, and executes filtering, sorting, and pagination directly in MongoDB:

1. **Indexes Created (`ensureDbIndexes`)**:
   - `items`: `{ slug: 1 }` (unique), `{ inStock: 1, quantity: 1, createdAtUtc: -1 }`, `{ category: 1, createdAtUtc: -1 }`, `{ "money.price": 1 }`
   - `events`: `{ slug: 1 }` (unique), `{ inStock: 1, quantity: 1, createdAtUtc: -1 }`, `{ "money.price": 1 }`
   - `blog_posts`: `{ slug: 1 }` (unique), `{ createdAtUtc: -1 }`
   - `users`: `{ email: 1 }` (unique)
   - `admins`: `{ username: 1 }` (unique)
   - `orders`: `{ status: 1, expiresAtUtc: 1 }`
   - `order_ttl_holds`: `{ expiresAt: 1 }` (`expireAfterSeconds: 0` TTL index with `changeStreamPreAndPostImages` enabled)
2. **Store (`items`) vs. Events (`events`) Collection Separation**:
   - `getStoreProducts()` and `getPaginatedItems()` query the `items` collection.
   - `getEventTickets()` and `getPaginatedEvents()` query the `events` collection.
3. **Never Trust URL Query Parameters for Admin Authorization**:
   - API routes never check `?admin=1` on the URL. All admin-privileged reads and writes verify the logged-in entity via `resolveAdminSessionFromRequest(request, db)` in `src/lib/admin.ts`.

---

## 3. Store Item Lifecycle (`SaleStage`) & Order Lifecycle (`OrderLifecycleStatus`)

### 3.1 Store Item Lifecycle (`getItemSaleStage` in `src/lib/premium.ts`)

```mermaid
stateDiagram-v2
  [*] --> Hidden: isHidden = true OR now < revealAtUtc
  Hidden --> PreOrderSoon: now >= revealAtUtc AND now < preOrderAtUtc
  PreOrderSoon --> PreOrder: now >= preOrderAtUtc
  PreOrder --> ComingSoon: now >= comingSoonAtUtc AND now < regularSaleAtUtc
  ComingSoon --> Regular: now >= regularSaleAtUtc
  Regular --> OutOfStock: quantity <= 0 (wontBeStocked = false)
  OutOfStock --> Regular: Restocked (quantity > 0)
  OutOfStock --> WontBeStocked: wontBeStocked = true
  WontBeStocked --> OutOfStock: wontBeStocked = false (quantity = 0)
  WontBeStocked --> Regular: Restocked / wontBeStocked with quantity > 0
  Regular --> WontBeStocked: quantity <= 0 (wontBeStocked = true)
```

- **`hidden`** -> **`pre-order-soon`** -> **`pre-order`** -> **`coming-soon`** -> **`regular`** <-> **`out-of-stock`** <-> **`wont-be-stocked`**.
- An item marked `wontBeStocked: true` acts as **`regular`** while `quantity > 0` (`inStock !== false`) and transitions to **`wont-be-stocked`** once `quantity === 0`.

### 3.2 Order Lifecycle (`OrderLifecycleStatus` in `src/lib/premium.ts`)

```mermaid
stateDiagram-v2
  [*] --> InCart: In cart (not an order yet)
  InCart --> OrderedNotPaid: Checkout (Bank Transfer / Cash)
  InCart --> OrderedPaid: Checkout (Credit Card / PayPal / Apple Pay / Google Pay)
  OrderedNotPaid --> OrderedPaid: Payment received
  OrderedPaid --> Packaged: Store packages order
  Packaged --> SentOrWaiting: Sent / Waiting for collection
  SentOrWaiting --> Completed: Order completed

  OrderedNotPaid --> Aborted: User aborts (before packaged)
  OrderedPaid --> Aborted: User aborts (before packaged)

  OrderedNotPaid --> Cancelled: Store cancels (before completed)
  OrderedPaid --> Cancelled: Store cancels (before completed)
  Packaged --> Cancelled: Store cancels (before completed)
  SentOrWaiting --> Cancelled: Store cancels (before completed)
```

- **Store Cancel (`cancelled`)**: At any point before `completed`, a logged-in store admin can cancel the order and automatically restore held stock to `items` / `events`.
- **User Abort (`aborted`)**: At any point before `packaged` (`ordered-not-paid` or `ordered-paid`), the logged-in customer who placed the order can abort it from `/account` and automatically restore held stock.

---

## 4. Customer & Admin Authentication Flow (Auth0 Delegation)

```mermaid
sequenceDiagram
  actor User as Customer / Staff Admin
  participant UI as /login, /account, or /admin
  participant API as /api/auth or /api/admin
  participant AuthSec as src/lib/auth-security.ts
  participant DB as MongoDB (users / admins)

  alt Customer One-Click Google Sign-In
    User->>UI: Click "Sign In with Google" (no manual email input)
    UI->>API: POST /api/auth { action: "oauth", provider: "google" }
    API->>AuthSec: verifyThirdPartyIdentity({ provider: "google", idToken })
    AuthSec-->>API: Verified Auth0 OAuth profile + email
    API->>DB: Upsert user (passwordHash: null, contactEmail = email)
    API-->>UI: Return UserProfile -> redirect to /account
  else Customer Email + Password Registration ("Create Your Account")
    User->>UI: Submit name, email, password
    UI->>API: POST /api/auth { action: "register", email, password }
    API->>AuthSec: hashPasswordScrypt(password) -> scrypt$salt$key
    API->>DB: Insert user with passwordHash (zero plaintext) & contactEmail = email
    API-->>UI: Return UserProfile -> redirect to /account
  else Admin Auth0 SSO / Delegated Login
    User->>UI: Sign in via Auth0 SSO or Admin credentials on /admin
    UI->>API: POST /api/admin { action: "login", auth0Token / password }
    API->>AuthSec: verifyAuth0AdminIdentity(...)
    API->>DB: Verify admin role & privileges, record audit log
    API-->>UI: Return signed HMAC Admin Session Token
  end
```

---

## 5. Checkout, Delivery & 3-Day Bank/Cash Reservation Flow

1. **Dedicated `/cart` Page**:
   - Displays cart items, loyalty discount breakdown, delivery method selector (`deliveryOptions` from `/api/metadata`), shipping address selector (from saved addresses or billing default), and payment method selector.
   - Gaming accounts (Wizards/Riot IDs) are managed exclusively on `/account` and never clutter `/cart`.
2. **Payment Method Branching (`POST /api/orders`)**:
   - **Credit Card / PayPal / Apple Pay / Google Pay**: Immediate fulfillment (`status: "ordered-paid"`), decrements `items.quantity` / `events.quantity`, increments `registeredCount` on event tickets, and awards loyalty points immediately.
   - **Bank Transfer / Cash (`bank-transfer` or `cash`)**: Creates a **3-day (72-hour) inventory reservation** (`status: "ordered-not-paid"`, `reservedUntilUtc = createdAtUtc + 72h`), immediately holds stock (`quantity` decremented), and inserts a companion TTL document into `order_ttl_holds` (`expiresAt: new Date(reservedUntilUtc)`).
   - **Capturing MongoDB TTL Deletion Events (`startOrderTtlChangeStream` & `handleOrderTtlDeletionEvent` in `src/lib/mongodb.ts`)**: Instead of polling or physically deleting order history, MongoDB's TTL index on `order_ttl_holds` (`expireAfterSeconds: 0`) deletes the hold document when `expiresAt` is reached. A Change Stream listener (`watch([{ $match: { operationType: "delete" } }], { fullDocumentBeforeChange: "whenAvailable" })`) captures the TTL `delete` event, transitions the corresponding order in `orders` from `ordered-not-paid` to `cancelled` (`cancelledReason: "ttl-expired-3-days"`), restores held stock to `items` and `events`, and increments the `dockside_order_ttl_deletions_total` OpenTelemetry/Prometheus metric.
