# Dockside Keep — Storefront, Events, Community Blog & Admin Platform

Welcome to the official repository for **Dockside Keep** (`docksidekeep-website`), the tabletop board games, trading card games (TCGs), pre-orders, and tournaments storefront located at **Derech HaAtzmaut 41, Haifa, Israel**.

This repository is designed for both **human developers** and **AI coding agents**. Before modifying any code, database logic, or tests, read this `README.md` and the guides in the [`docs/`](./docs/) directory.

---

## Documentation Index (`docs/`)

| Document | Purpose |
| :--- | :--- |
| [**`docs/ARCHITECTURE_AND_FLOWS.md`**](./docs/ARCHITECTURE_AND_FLOWS.md) | End-to-end system architecture, Mermaid flowcharts, 3-stage product release lifecycle, Auth0 customer/admin flows, 3-day bank/cash reservation lifecycle, loyalty points, and OpenTelemetry/Grafana observability. |
| [**`docs/DECISIONS_AND_CONSTRAINTS.md`**](./docs/DECISIONS_AND_CONSTRAINTS.md) | Architecture Decision Records (ADRs) and **mandatory invariants** for developers and AI agents (zero DB wiping, zero dummy data seeding, Auth0 delegation, salted `scrypt` verifiers, UTC-everywhere storage, immutable item titles, bilingual EN/HE RTL parity, WAI-ARIA + JSON-LD SEO). |
| [**`docs/API_AND_DATA_MODELS.md`**](./docs/API_AND_DATA_MODELS.md) | Complete specification of REST API routes (`/api/items`, `/api/blog`, `/api/orders`, `/api/auth`, `/api/admin`, `/api/metadata`, `/api/premium`, `/api/telemetry`), pagination payloads, and MongoDB collection schemas & indexes. |

---

## Service Architecture & Port Map (`docker-compose.yml`)

All application, database, observability, and E2E browser testing services run inside Docker containers:

| Container Name | Service | Host Port | Description |
| :--- | :--- | :--- | :--- |
| `docksidekeep-web` | `web` | `http://localhost:3000` | Next.js App Router storefront, public blog, customer account & Admin portal |
| `docksidekeep-grafana` | `grafana` | `http://localhost:3001` | Pre-provisioned Grafana dashboards (Prometheus metrics + Loki audit/error logs) |
| `docksidekeep-prometheus` | `prometheus` | `http://localhost:9090` | Prometheus scraper polling `/api/telemetry?format=prometheus` |
| `docksidekeep-loki` | `loki` | `http://localhost:3100` | Grafana Loki log aggregation server receiving structured JSON logs |
| `docksidekeep-mongo` | `mongo` | `mongodb://localhost:27017/docksidekeep` | Persistent MongoDB database (`mongo_data` volume) |
| `docksidekeep-web-test` | `web-test` | `http://localhost:3002` *(test profile)* | Isolated Next.js E2E test server connected to `mongo-test` |
| `docksidekeep-mongo-test` | `mongo-test` | *(test profile, internal)* | Ephemeral in-memory (`tmpfs`) MongoDB container for E2E tests |
| `docksidekeep-playwright` | `playwright` | *(test profile)* | Headless Chromium E2E test runner against `http://web-test:3000` |

---

## Quick-Start Commands

### 1. Build, Typecheck, Lint, Run Unit Tests & Start All Containers
```powershell
docker compose up -d --build
```
> During `docker compose build`, the `Dockerfile` automatically executes:
> 1. `pnpm run typecheck` (`tsc --noEmit`)
> 2. `pnpm run lint` (`eslint .` with `eslint-config-next`, `eslint-config-next/core-web-vitals`, and `eslint-config-next/typescript`)
> 3. `pnpm run test:unit` (`vitest run`)
> 4. `pnpm run build` (`next build`)

### 2. Run the Full Playwright End-to-End Browser Suite (Isolated Ephemeral DB)
```powershell
pnpm run test:e2e:docker
```
*(Or manually via `docker compose run --rm playwright`, which starts `mongo-test` and `web-test` without touching your local `docksidekeep` database.)*

---

## Golden Rules for Developers & AI Agents

1. **Never Wipe the Database & Never Seed Dummy/Mock Data**:
   - Do **not** drop or clear MongoDB collections on application startup, restart, or migration.
   - Do **not** populate `INITIAL_ITEMS`, mock events, or default loyalty classes into MongoDB (`INITIAL_ITEMS` in `src/lib/mongodb.ts` must remain `[]`).
   - E2E tests in `tests/e2e/storefront.spec.ts` must clean up their own temporary test slugs in `test.afterAll`.
2. **Auth0 Delegation & Salted `scrypt` Verifiers Only**:
   - Customer and Admin authentication is delegated via `src/lib/auth-security.ts` (`verifyThirdPartyIdentity`, `verifyAuth0AdminIdentity`) and salted `scrypt` hashes (`hashPasswordScrypt`, `verifyPasswordScrypt`).
   - Never store plaintext passwords in `users` or `admins`, and always redact `password` and `passwordHash` in audit logs (`sanitizeAuditValue` in `src/lib/admin.ts`).
3. **One-Click Google Sign-In & Automatic Newsletter Email**:
   - Users signing in with Google do not type an email address manually; their Google email (or registered email+password address) is automatically bound as their `contactEmail` for newsletters and alerts.
4. **Protected `/account` Route**:
   - `/account` is inaccessible when signed out (`authHydrated && !user` immediately redirects to `/login`, and the navbar `/account` link is rendered only when signed in).
5. **UTC-Everywhere Storage + Browser-Locale Display**:
   - Always store dates/timestamps as UTC ISO-8601 strings (`*Utc`) in MongoDB and format them in the user's browser timezone/locale using `<LocalizedTime>` (`src/components/ui/localized-time.tsx`).
6. **No Technical Stack Jargon in User/Admin Copy**:
   - Never mention implementation stack terms (`Next.js`, `MongoDB`, `Docker`, `shadcn`) in `src/lib/i18n.ts`.
