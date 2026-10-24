# API Reference & MongoDB Data Models

This document describes the REST API endpoints and MongoDB collections used by **Dockside Keep**.

---

## 1. REST API Endpoints (`src/app/api/`)

### `GET /api/items`
Fetches paginated store products from the `items` collection in MongoDB (`getPaginatedItems`).
- **Query Parameters**:
  - `page` *(number, default `1`)*: 1-based page index.
  - `pageSize` *(number, default `50`, max `100`)*: Maximum items per page.
  - `category` *(string)*: Category filter (e.g. `"Store Items"`).
  - `type` *(`"board-game"` | `"tcg"` | `"item"`)*: Product type filter.
  - `search` *(string)*: Case-insensitive regex search across `title`, `title_he`, `description`, `description_he`, and `slug`.
  - `maxPrice` *(number)*: Maximum `money.price` in ILS (`₪`).
  - `sort` *(`"newest"` | `"oldest"` | `"price-asc"` | `"price-desc"`, default `"newest"`)*: Sort order.
  - `includeOutOfStock` *(`"1"`)*: Include out-of-stock (`out-of-stock` and `wont-be-stocked`) items.
- **Admin Authorization**: Never trusts URL query parameters (`?admin=1`). Instead, verifies the logged-in admin entity via `resolveAdminSessionFromRequest(request, db)` (`x-admin-token` or `Authorization: Bearer <token>`) before returning hidden items.

### `GET /api/events`, `POST /api/events`, `PATCH /api/events`, `DELETE /api/events`
Dedicated endpoint for tournament and event tickets stored in the separate `events` MongoDB collection (`getPaginatedEvents`). Admin write actions require the `events` privilege verified via `resolveAdminSessionFromRequest`.
- **Response (`200 OK`)**:
  ```json
  {
    "items": [ /* StoreItem[] */ ],
    "pagination": {
      "currentPage": 1,
      "pageSize": 9,
      "totalItems": 12,
      "totalPages": 2,
      "hasPrevPage": false,
      "hasNextPage": true
    }
  }
  ```

### `POST /api/items` *(Admin `inventory` or `events` privilege required)*
- Creates or upserts a single store item / event ticket, **or** imports multiple items in bulk when `{ csvText: string }` is provided (`parseInventoryCsv`).
- Records an immutable entry in `admin_audit_logs`.

### `PATCH /api/items` *(Admin `inventory` or `events` privilege required)*
- Updates mutable fields on an item (`quantity`, `inStock`, `money`, `preOrderMoney`, `imageUrl`, `description`, `description_he`, `isHidden`, `revealAtUtc`, `preOrderAtUtc`, `regularSaleAtUtc`, `facebookUrl`, `eventDate`, `venue`, `showRegisteredCount`, `minPlayers`, `maxPlayers`).
- **Locked fields**: `title` and `title_he` are ignored on `PATCH`.

### `DELETE /api/items?slug=<slug>` *(Admin `inventory` or `events` privilege required)*
- Deletes the item or event with the given `slug` and records an audit log entry with the previous document snapshot.

---

### `GET /api/blog`
- **Single Post Lookup**: `GET /api/blog?slug=<slug>` returns `{ post: BlogPost }` (or `404` if not found).
- **Paginated List**: `GET /api/blog?page=1&pageSize=6` returns `{ posts: BlogPost[], pagination: DbPaginationMeta }` sorted by `createdAtUtc` descending.

### `POST /api/blog` & `DELETE /api/blog?slug=<slug>` *(Admin `blog` privilege required)*
- Publishes/updates or deletes a community blog post and records an admin audit log entry and OpenTelemetry feature counter (`blog_post_publish`).

---

### `POST /api/auth` & `PATCH /api/auth`
- **`POST /api/auth`**:
  - `action: "oauth"` (`provider: "google"`): Verifies Google identity via Auth0 (`verifyThirdPartyIdentity`), binds the Google email as `contactEmail`, and returns the user profile.
  - `action: "register"`: Hashes password with `hashPasswordScrypt`, sets `contactEmail = email`, initializes Opt-Out notification preferences (`false`), and creates the user document.
  - `action: "login"`: Verifies password in constant time via `verifyPasswordScrypt`.
- **`PATCH /api/auth`**: Updates user profile fields (`billingAddress`, `savedAddresses`, `deliveryAddress`, `savedPaymentMethods`, `paymentMethod`, `gamingAccounts`, `notifications`, `preferences`, `linkedProviders`).

---

### `GET /api/admin`, `POST /api/admin`, `DELETE /api/admin`
- **`POST /api/admin`**:
  - `action: "login"` / `action: "auth0-sso"`: Authenticates staff admin via `verifyAuth0AdminIdentity` and returns an HMAC-SHA256 `adminToken` + `adminProfile` (`role`, `level`, `privileges`, `authProvider: "auth0"`, `auth0Sub`).
  - `action: "create_admin"`: Owner admin (`manage_admins` privilege) provisions a sub-admin with granular privileges (`inventory`, `events`, `metadata`, `blog`, `manage_admins`) and a salted `scrypt` verifier.
- **`GET /api/admin`**:
  - Returns audit logs (`admin_audit_logs`), sub-admin list, or CSV export of event participants (`?eventParticipantsCsv=<slug>`).

---

### `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders`
- Creates orders, decrements item stock across `items` and `events`, records event participant registrations (`wizardsAccount`, `riotAccount`), and increments customer loyalty points.
- For 3-day unpaid bank transfer / cash orders (`status: "ordered-not-paid"`), `POST /api/orders` inserts a companion TTL hold document into `order_ttl_holds` with `expiresAt = new Date(reservedUntilUtc)`. When MongoDB's TTL monitor deletes the hold document after 72 hours, the Change Stream listener (`startOrderTtlChangeStream` -> `handleOrderTtlDeletionEvent` in `src/lib/mongodb.ts`) captures the TTL `delete` event, transitions the order in `orders` to `status: "cancelled"` (`cancelledReason: "ttl-expired-3-days"`), and restores held stock to `items` and `events` while keeping the `orders` history intact.
- When an order leaves `ordered-not-paid` via `PATCH /api/orders` (e.g., paid, cancelled, or aborted early), its companion `order_ttl_holds` document is immediately deleted.

---

### `GET /api/metadata` & `PUT /api/metadata`
- Reads and updates store contact metadata (`phone`, `email`, `whatsapp`, `address`, `hours`, `mapEmbedUrl`, `deliveryOptions`).

### `GET /api/premium`, `POST /api/premium`, `PATCH /api/premium`, `DELETE /api/premium`
- Manages loyalty classes (`premium_classes`) and user point/class assignments (`loyalty_users`).

### `GET /api/telemetry`
- `?format=prometheus`: Returns Prometheus text exposition metrics (`dockside_admin_audit_logs_total`, `dockside_feature_usage_total`, `dockside_feature_errors_total`, `dockside_store_orders_total`, `dockside_store_Catalog_items_total`).
- Default JSON: Returns structured telemetry summary, recent errors, and observability stack URLs (`grafanaUrl`, `prometheusUrl`, `lokiUrl`).

---

## 2. MongoDB Collections & Indexes (`docksidekeep`)

| Collection | Unique Index | Secondary Indexes | Purpose |
| :--- | :--- | :--- | :--- |
| `items` | `{ slug: 1 }` | `{ inStock: 1, quantity: 1, createdAtUtc: -1 }`, `{ category: 1, createdAtUtc: -1 }`, `{ "money.price": 1 }` | Store products (`board-game`, `tcg`, `item`) — strictly separated from `events` |
| `events` | `{ slug: 1 }` | `{ inStock: 1, quantity: 1, createdAtUtc: -1 }`, `{ "money.price": 1 }` | Tournament and event tickets (`kind: "event"`, `type: "ticket"`) |
| `blog_posts` | `{ slug: 1 }` | `{ createdAtUtc: -1 }` | Admin-published community articles rendered on `/blog` and `/blog/[slug]` |
| `users` | `{ email: 1 }` | — | Customer accounts (`passwordHash`, `authStrategy`, `contactEmail`, `notifications`, addresses, payments, gaming IDs) |
| `admins` | `{ username: 1 }` | — | Staff admin accounts (`authProvider: "auth0"`, `auth0Sub`, `passwordHash`, `role`, `level`, `privileges`) |
| `orders` | — | `{ status: 1, expiresAtUtc: 1 }` | Customer orders and 3-day bank/cash reservations (preserved indefinitely for order history) |
| `order_ttl_holds` | — | `{ expiresAt: 1 }` (`expireAfterSeconds: 0` TTL index) | Ephemeral 3-day TTL reservation holds watched by Change Stream (`operationType: "delete"`) to trigger automatic order cancellation and stock restoration |
| `premium_classes` | — | — | Loyalty tiers (`minPoints`, `discountPercent`, `isPointsReachable`) |
| `loyalty_users` | — | — | Customer loyalty points (`points`, `assignedClassId`) |
| `metadata` | — | — | Store contact info, opening hours, and `deliveryOptions` (`_id: "store_contact"`) |
| `admin_audit_logs` | — | — | Immutable before/after audit log entries (with `password` and `passwordHash` redacted) |
| `telemetry_metrics` | — | — | Feature usage counters exported to Prometheus |
| `telemetry_errors` | — | — | Error investigation records exported to Prometheus and Loki |
