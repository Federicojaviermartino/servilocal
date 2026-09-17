<div align="center">

# ServiLocal

![ServiLocal](https://img.shields.io/badge/SERVILOCAL-MARKETPLACE-1e293b?style=for-the-badge)
![Version](https://img.shields.io/badge/VERSION-1.0.0-2563eb?style=for-the-badge)
![License](https://img.shields.io/badge/LICENSE-MIT-16a34a?style=for-the-badge)
![Next.js](https://img.shields.io/badge/NEXT.JS-14-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NESTJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![PostGIS](https://img.shields.io/badge/POSTGIS-3.6-336791?style=for-the-badge&logo=postgresql&logoColor=white)

**Local Services Marketplace with Geospatial Search and Real Payments**

[Live Demo](https://servilocal-web.onrender.com) ·
[API Reference](https://servilocal-api.onrender.com/api/docs) ·
[Diagrams](diagrams/) ·
[Wireframes](wireframes/)

[![CI](https://github.com/Federicojaviermartino/servilocal/actions/workflows/ci.yml/badge.svg)](https://github.com/Federicojaviermartino/servilocal/actions/workflows/ci.yml)
![Locales](https://img.shields.io/badge/i18n-10%20locales-7c3aed)
![Accessibility](https://img.shields.io/badge/WCAG%202.1-AA-0891b2)
![Tests](https://img.shields.io/badge/tests-19%20unit%20%2B%2028%20e2e-475569)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Engineering Highlights](#engineering-highlights)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Security](#security)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Project Context](#project-context)
- [License](#license)

---

## Overview

ServiLocal connects people who need work done at home — plumbing, electrical, cleaning, painting, renovations, private tutoring — with professionals in their area. It handles the full journey: proximity search, booking, payment, messaging and reviews.

The stack is a Next.js front end, a NestJS REST API, PostgreSQL with PostGIS for spatial queries, and Stripe for payments. Everything described below is deployed and reachable from the live demo — there is no mock layer.

---

## Live Demo

**[servilocal-web.onrender.com](https://servilocal-web.onrender.com)** · Swagger: **[servilocal-api.onrender.com/api/docs](https://servilocal-api.onrender.com/api/docs)**

The login page has **one-click demo access** — no need to type anything:

| Role | Account | What you can do |
|------|---------|-----------------|
| Client | `laura@ejemplo.com` | Search, book, pay, review, message providers |
| Provider | `carlos@ejemplo.com` | Publish services, accept or reject bookings |
| Administration | `demo@servilocal.com` | Read the metrics, reputation and moderation panels |

Password for all three, if you prefer to type it: `Password123!`

The administration account is **read-only**, enforced on the server: it can read
everything and write nothing, so the demo survives the next visitor. The rule is
applied by HTTP method rather than by a list of routes, so an endpoint added
later is blocked without anyone having to remember it.

> **Note on the first load.** Both services run on Render's free tier and sleep after 15 minutes without traffic. The first request can take up to a minute while they wake up; after that it is fast. A scheduled job pings them during working hours to reduce the chance of a cold start.

---

## Screenshots

| Search with filters, map view and pagination |
|---|
| ![Search results](docs/screenshots/search.png) |

| The same screen in dark mode |
|---|
| ![Search results in dark mode](docs/screenshots/search-dark.png) |

| Service detail | One-click demo access |
|---|---|
| ![Service detail](docs/screenshots/service-detail.png) | ![Demo login](docs/screenshots/demo-login.png) |

| Mobile — search | Mobile — service detail |
|---|---|
| <img src="docs/screenshots/search-mobile.png" width="280" alt="Mobile search"> | <img src="docs/screenshots/service-detail-mobile.png" width="280" alt="Mobile service detail"> |

---

## Features

**Anyone**
- Geolocated search with filters: category, city, radius, minimum rating, maximum price
- Results as a list or on a Leaflet map with markers
- Accent- and case-insensitive search that also matches trade names, so "fontaneria" finds *Fontanería*
- Service detail with verified reviews, price range and provider profile
- Light and dark themes: follows the system preference, and remembers an explicit choice
- Available in 10 languages, picked from the browser and switchable at any time, right-to-left layout included

**Clients**
- Booking form with validation, dates handled in ISO UTC to avoid timezone drift
- Payment through Stripe Payment Element using **manual capture**: funds are held, not taken, until the job is confirmed
- Bookings filtered by status, with cancellation where allowed
- Reviews — only after a completed booking, so ratings reflect real work
- Direct messaging with providers

**Providers**
- Full CRUD over published services, including coverage radius and price unit
- Incoming bookings with confirm, reject, complete and cancel actions
- Messaging with clients

**Administrators**
- Protected by JWT guards plus a role guard
- User management: list, filter by role and status, activate or deactivate
- Hierarchical category management
- Moderation queue for reported reviews
- Basic platform metrics

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Front end | React 18, Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS with semantic colour tokens, Atomic Design component structure |
| Internationalisation | next-intl, 10 locales with per-locale static generation, ICU plurals, `hreflang` alternates and RTL support |
| Back end | NestJS, TypeScript |
| Database | PostgreSQL with PostGIS (schema managed by TypeORM migrations) |
| ORM | TypeORM, with a numeric transformer for decimal columns |
| Maps | Leaflet + react-leaflet, dynamically imported to avoid SSR issues |
| Auth | JWT with Passport, bcrypt password hashing |
| Payments | Stripe Payment Element, manual capture, signed webhook |
| Component catalogue | Storybook 10, with locale and theme switchers in the toolbar |
| Observability | Sentry for unhandled errors, `/api/health` with a real database probe |
| AI layer | Anthropic SDK behind a one-method interface, with a null provider, persisted usage accounting and a hard monthly spend ceiling |
| Real-time messaging | Socket.IO gateway with one private room per person. Clients never ask to join a room: the server puts each connection in its own and emits to both participants of a conversation, which it reads from the stored conversation. HTTP polling stays as a fallback while the socket is down |
| Admin dashboard | Every figure comes from a SQL aggregation, never from counting rows in the browser. Charts with Recharts, theme-aware through the same CSS variables as the rest of the UI. The weekly series fills empty weeks server-side, so the line never joins two distant dates as if they were adjacent |
| Testing | Jest (19 unit tests), Playwright (28 end-to-end tests, desktop and mobile) |
| CI | GitHub Actions: lint, type-check, tests, build and catalogue on every push |
| Hosting | Render (web services) + Neon (PostgreSQL) |

---

## Architecture

Three-tier client–server. The front end consumes the REST API; the API persists to PostgreSQL/PostGIS and integrates with Stripe.

```
┌──────────────────┐        HTTPS / JSON      ┌──────────────────┐
│    Next.js 14    │ ───────────────────────► │     NestJS 10    │
│    App Router    │ ◄─────────────────────── │     REST API     │
│    10 locales    │                          │    JWT + Roles   │
└──────────────────┘                          └────────┬─────────┘
         │                                             │
         │ Stripe Payment Element              TypeORM │ migrations
         ▼                                             ▼
┌──────────────────┐     signed webhook       ┌──────────────────┐
│      Stripe      │ ───────────────────────► │  PostgreSQL 18   │
│  manual capture  │                          │   + PostGIS 3.6  │
└──────────────────┘                          └──────────────────┘
```

UML diagrams live in [`diagrams/`](diagrams/) and responsive wireframes in [`wireframes/`](wireframes/), both as standalone HTML.

---

## Engineering Highlights

- **Spatial search** uses PostGIS `ST_DWithin` against GiST-indexed geometry columns, not a bounding-box approximation.
- **Text and city matching** is accent-insensitive through an `IMMUTABLE` SQL expression, backed by a functional index so it stays indexable.
- **Payments use manual capture**, so the client's money is authorised at booking time and only captured when the work is confirmed — the correct model for a marketplace.
- **The webhook verifies Stripe's signature** against the raw request body, which is why the Nest app boots with `rawBody: true`.
- **Reviews are tied to completed bookings** by a unique constraint, so ratings cannot be faked.
- **The API client retries idempotent reads only.** A timed-out `GET` is retried once; a `POST` never is, because repeating one could duplicate a booking or a charge.
- **`/api/health` checks the database, not just the process.** An API that boots but cannot reach its database is down in practice — exactly the failure this project had, unnoticed, for four months. It returns `503` when the database does not answer, so a monitor can actually detect it.
- **Dark mode uses semantic tokens, not a second set of classes.** Components name the role of a colour (`bg-superficie`, `text-principal`), never the colour itself. The theme is applied by a blocking inline script before first paint, so there is no flash of the wrong theme.
- **Ten languages, statically generated.** Every page is prerendered once per locale rather than translated in the browser, so a crawler and a first-time visitor get the same HTML. The locale comes from the URL, each page declares `hreflang` alternates plus `x-default`, and Arabic flips `dir` to `rtl` at the document root. Catalogues are checked for key parity against Spanish, so a missing translation is caught before it ships rather than showing as a blank label in production. Every screen is covered, dashboard and admin panel included; the terms and privacy texts stay in Spanish on purpose, with a notice in the reader's language saying the Spanish version is the one that prevails.
- **The component catalogue renders components the way the app does.** Stories run inside the same locale provider and theme tokens as the application, and the toolbar switches both, so a card can be checked in Arabic on a dark background without starting the API. CI builds the catalogue on every push, because a broken story breaks nothing in production and would otherwise rot unnoticed.
- **The spend ceiling is asked before spending, not measured after.** Usage is accumulated in PostgreSQL with an `ON CONFLICT DO UPDATE`, never in process memory: on a free tier the instance sleeps several times a day, so an in-memory counter resets with it and a ceiling built on one only looks like a ceiling. Failed calls are recorded too — a call that timed out still cost latency, and one that appears nowhere is one nobody notices. Costs are integer cents, computed from the token counts the provider returns rather than estimated.
- **No API key means no AI, not no application.** The provider is chosen once, by injection: with a key it is the real one, without it a null provider that fails immediately with a typed cause so the caller takes its deterministic path. The app logs which one it got, next to the equivalent line for Sentry. Nothing in the layer throws at boot.
- **Rate limiting is proxy-aware.** Behind Render's proxy, without `trust proxy` every request appears to come from the same address and one attacker would lock out every user.
- **Lock files are generated on Linux, not on the development machine.** npm resolves peer dependencies differently per operating system: `next-intl` pulls in `@swc/core`, which declares `@swc/helpers >=0.5.17` as an optional peer while Next pins `0.5.5` exactly, and Storybook brings the same clash with `ajv`. Linux resolves each into two entries, Windows into one, and `npm ci` rejects the Windows tree outright. `npm run lock` rebuilds the tree inside a `node:22` container and refuses to write the file until `npm ci` accepts it.

---

## Getting Started

### Prerequisites

- Node.js 20 or newer
- Docker and Docker Compose
- A Stripe account in test mode (publishable and secret keys)

### 1. Clone and start the database

```bash
git clone https://github.com/Federicojaviermartino/servilocal.git
cd servilocal
docker compose up -d db
```

### 2. Configure the back end

Create `backend/.env` from `backend/.env.example`:

```env
# Local database (ignored when DATABASE_URL is set)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=servilocal_user
DB_PASSWORD=servilocal_dev_2026
DB_DATABASE=servilocal

# Alternative: a single URL, SSL enabled
# DATABASE_URL=postgresql://user:password@host:5432/database

JWT_SECRET=change_this_in_production
JWT_EXPIRATION=7d

CORS_ORIGINS=http://localhost:3000

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # optional at boot

NODE_ENV=development
PORT=3001
```

### 3. Install, migrate and seed

```bash
cd backend
npm install
npm run migration:run   # creates the schema, including the PostGIS extension
npm run seed            # 16 users, 10 categories, 25 services, 79 reviews
npm run start:dev
```

The API runs at `http://localhost:3001/api`, with interactive Swagger docs at `/api/docs`.

> The schema is created **only** by migrations — `synchronize` is off in every environment, so local and production can never drift apart. In deployed environments pending migrations run automatically at boot.

### 4. Configure and start the front end

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### 5. Optional — test the Stripe webhook locally

```bash
stripe listen --forward-to localhost:3001/api/payments/webhook
```

Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` and restart the back end.

---

## Project Structure

```
servilocal/
  backend/                  NestJS + TypeORM + PostgreSQL/PostGIS + Stripe
    src/
      auth/                 JWT authentication with Passport
      users/                User management
      categories/           Hierarchical categories
      services/             Services with geospatial search (ST_DWithin)
      bookings/             Bookings and their state machine
      reviews/              Reviews tied to completed bookings
      payments/             Stripe integration, manual capture
        payments-webhook.controller.ts    Signature-verified webhook
      messages/             Direct messaging between users
      health/               Liveness probe backed by a real query
      entities/             TypeORM entities
      common/               Guards, decorators, filters and transformers
      config/               Database config and CLI data source
      database/
        migrations/         Schema history — the only source of truth
        seeds/              Reproducible demo data
  frontend/                 Next.js 14 App Router + Tailwind
    .storybook/             Component catalogue config and sample data
    e2e/                    Playwright specs, desktop and mobile projects
    messages/               Translation catalogues, one JSON per locale
    src/
      app/
        [locale]/           Every route, prerendered once per language
        robots.ts, sitemap.ts
      i18n/                 Locale list, localised navigation, per-request config
      middleware.ts         Locale detection and URL prefixing
      components/
        atoms/              Button, Input, Badge, Avatar, Spinner
        molecules/          SearchBar, ServiceCard, SelectorTema, SelectorIdioma, Pagination
        organisms/          FilterPanel, ResultsList, ServiceMap, forms
        templates/          DashboardLayout
        layout/             Header, Footer
      lib/                  API client, auth store (Zustand), Stripe, shared constants
      types/                Shared TypeScript types
  diagrams/                 UML diagrams (Mermaid)
  wireframes/               Responsive wireframes
  scripts/                  Lock file regeneration inside Linux
  docs/screenshots/         Images used in this README
  docker-compose.yml
```

---

## API Reference

Interactive documentation is generated with OpenAPI and served at **[`/api/docs`](https://servilocal-api.onrender.com/api/docs)**. Every route is prefixed with `/api`.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | — | Create a client or provider account |
| `POST` | `/auth/login` | — | Obtain a JWT |
| `GET` | `/auth/profile` | JWT | Current user, resolved from the token |
| `GET` | `/services/search` | — | Geospatial search with filters and pagination |
| `GET` | `/services/:id` | — | Service detail |
| `GET` | `/services/provider/:providerId` | — | Services published by one provider |
| `POST` `PUT` `DELETE` | `/services` | Provider | Manage own services |
| `GET` | `/categories` | — | Hierarchical category tree |
| `POST` `PUT` `DELETE` | `/categories/:id` | Admin | Manage categories |
| `POST` | `/bookings` | Client | Create a booking |
| `GET` | `/bookings/my` · `/bookings/received` | JWT | Bookings by role |
| `PATCH` | `/bookings/:id/status` | JWT | Advance the booking state machine |
| `POST` | `/payments/create-intent` | Client | Payment intent with manual capture |
| `POST` | `/payments/capture/:bookingId` | Admin | Capture held funds |
| `POST` | `/payments/refund/:bookingId` | Admin | Refund |
| `POST` | `/payments/webhook` | Signature | Stripe events, verified against the raw body |
| `GET` | `/reviews/service/:serviceId` | — | Reviews for a service |
| `POST` | `/reviews` | Client | Review a completed booking |
| `PATCH` | `/reviews/:id/response` | Provider | Public reply to a review |
| `PATCH` | `/reviews/:id/report` | JWT | Report a review |
| `GET` | `/reviews/reported` | Admin | Moderation queue |
| `POST` | `/messages` · `/messages/conversation/:id` | JWT | Direct messaging |
| `GET` | `/users` · `PATCH /users/:id/toggle-active` | Admin | User administration |
| `GET` | `/health` | — | Liveness, `503` when the database does not answer |

---

## Configuration

**API (`servilocal-api`)**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string with SSL |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRATION` | For example `7d` |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret from the Stripe dashboard |
| `CORS_ORIGINS` | Comma-separated list of allowed origins |
| `SENTRY_DSN` | Optional. Without it, error reporting stays off and the app boots normally |
| `THROTTLE_AUTH_LIMIT` | Optional. Raises the login rate limit in test environments |
| `ANTHROPIC_API_KEY` | Optional. Without it the AI layer stays inactive and the app boots normally |
| `IA_ACTIVA` | Optional. `false` turns the AI layer off even when a key is present |
| `IA_MODELO` | Optional. Defaults to `claude-haiku-4-5-20251001` |
| `IA_TOPE_MENSUAL_CENTIMOS` | Optional. Hard monthly ceiling in cents, checked before every call. Defaults to `100` (1 €) |

**Front end (`servilocal-web`)**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Public URL of the API, including `/api` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for `sitemap.xml` and Open Graph |

`NEXT_PUBLIC_*` variables are injected as Docker build args, because Next.js inlines them at build time. After changing one, redeploy with **Clear build cache** — a restart is not enough.

---

## Deployment

The deployed demo uses:

- **Neon** for PostgreSQL with PostGIS — a free tier that does not expire after 30 days, unlike the alternatives.
- **Render** for two web services, each built from its own Dockerfile: the NestJS API and the Next.js front end.
- **GitHub Actions** for CI and for a scheduled job that keeps both services awake during working hours.

### Stripe webhook

Register `https://servilocal-api.onrender.com/api/payments/webhook` in the Stripe dashboard for these events:

- `payment_intent.amount_capturable_updated` — marks the booking as confirmed
- `payment_intent.succeeded` — completes the payment
- `payment_intent.payment_failed` — leaves the booking awaiting retry
- `payment_intent.canceled`

---

## Security

Controls implemented in the API and the front end:

| Area | Control |
|------|---------|
| Authentication | JWT with Passport, `bcrypt` password hashing, password column excluded from queries with `select: false` |
| Authorisation | Route guards by role; the role guard rejects a missing user instead of throwing a `500` |
| Input validation | Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`; `ParseUUIDPipe` on every id parameter, so a malformed id returns `400` and never reaches the database |
| Rate limiting | `@nestjs/throttler` globally, a tighter limit on the login route, and `trust proxy` so the client address is the real one behind Render's proxy |
| Payments | Webhook signature verified against the raw request body; funds held with manual capture, never taken automatically |
| Transport | Content Security Policy plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`; database connections validate the server certificate |
| Error handling | Global exception filter with structured logging; Sentry capture strips `authorization` and `cookie` headers |

Hardening still in progress is tracked in the [roadmap](#roadmap).

---

## Testing

```bash
# Back end
cd backend
npm run lint
npm run test          # 19 unit tests across 3 suites
npm run test:cov
npm run build

# Front end
cd frontend
npm run lint
npm run type-check
npm run build

# End-to-end (Playwright, desktop and mobile viewports)
cd frontend
npx playwright install chromium   # first run only
npm run e2e

# Component catalogue
cd frontend
npm run storybook

# Regenerate a lock file after changing dependencies (needs Docker)
npm run lock
```

The end-to-end suite covers search with accent-insensitive matching, pagination, city filtering, the collapsible mobile filter panel, the map, demo login, failed login, route protection, theme switching, language detection and switching, and a full booking paid with a Stripe test card.

The payment test skips itself, with an explicit reason, when Stripe keys are not configured — the booking is still created, but there is nothing to charge. Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as repository secrets to run it for real in CI.

All of these run in CI on every push to `main`. The end-to-end job spins up the whole stack: a PostGIS container, migrations, the seed, the API and the built front end.

---

## Roadmap

| Status | Item |
|--------|------|
| Next | Reduce the public search response to a provider projection, so only the fields a visitor needs are returned |
| Next | Aggregation endpoints for the admin panel, so metrics are computed in SQL instead of counting arrays in the browser |
| Next | Provider-level reputation, aggregating ratings across all of a provider's services |
| Planned | Natural-language search, so the nine non-Spanish locales can reach a catalogue written in Spanish |
| Planned | Usage and budget accounting for any paid external API, persisted rather than held in memory |
| Considering | Seed data with a realistic spread of booking states and ratings, to make the admin views meaningful |

---

## Project Context

ServiLocal is the Master's thesis project for the *Máster Universitario en Desarrollo de Sitios y Aplicaciones Web* at Universitat Oberta de Catalunya (UOC), 2025/2026.

**Author:** Federico Javier Martino

The application meets the nine assessment requirements of the course, including WCAG 2.1 level AA accessibility, role management, in-app administration and deployment to a public server. The written dissertation, self-assessment report, checklist and defence presentation were submitted through the university's platform and are not part of this repository.

---

## License

Code released under the [MIT License](LICENSE). The dissertation text is under Creative Commons Attribution–NonCommercial–NoDerivatives 3.0 Spain.
