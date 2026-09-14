# ServiLocal

**A local services marketplace with geolocation search, verified reviews and real payments.**

ServiLocal connects people who need work done at home — plumbing, electrical, cleaning, painting, renovations, private tutoring — with professionals in their area. It handles the full journey: proximity search, booking, payment, messaging and reviews.

Built as a full-stack project with a Next.js front end, a NestJS REST API, PostgreSQL with PostGIS for spatial queries, and Stripe for payments.

---

## Live demo

**[servilocal-web.onrender.com](https://servilocal-web.onrender.com)** · API docs (Swagger): **[servilocal-api.onrender.com/api/docs](https://servilocal-api.onrender.com/api/docs)**

The login page has **one-click demo access** — no need to type anything:

| Role | Account | What you can do |
|------|---------|-----------------|
| Client | `laura@ejemplo.com` | Search, book, pay, review, message providers |
| Provider | `carlos@ejemplo.com` | Publish services, accept or reject bookings |

Password for every seeded account: `Password123!`

**Stripe test card:** `4242 4242 4242 4242`, any future expiry date, CVC `123`. Payments run in Stripe test mode, so nothing is ever charged. Once confirmed, the booking flips to *Confirmed* automatically through the signed webhook.

> **Note on the first load.** The demo runs on free hosting tiers that sleep after 15 minutes of inactivity. A scheduled job keeps it warm during working hours (08:00–16:00 UTC). Outside that window the first request wakes the server and can take up to a minute — the app shows a notice and retries automatically instead of failing.

---

## Screenshots

| Search with filters, map view and pagination |
|---|
| ![Search results](docs/screenshots/search.png) |

| Service detail | One-click demo access |
|---|---|
| ![Service detail](docs/screenshots/service-detail.png) | ![Demo login](docs/screenshots/demo-login.png) |

| Mobile — search | Mobile — service detail |
|---|---|
| <img src="docs/screenshots/search-mobile.png" width="280" alt="Mobile search"> | <img src="docs/screenshots/service-detail-mobile.png" width="280" alt="Mobile service detail"> |

---

## What it does

**Anyone**
- Geolocated search with filters: category, city, radius, minimum rating, maximum price
- Results as a list or on a Leaflet map with markers
- Accent- and case-insensitive search that also matches trade names, so "fontaneria" finds *Fontanería*
- Service detail with verified reviews, price range and provider profile

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

## Tech stack

| Layer | Technology |
|-------|-----------|
| Front end | React 18, Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS, Atomic Design component structure |
| Back end | NestJS, TypeScript |
| Database | PostgreSQL with PostGIS (schema managed by TypeORM migrations) |
| ORM | TypeORM, with a numeric transformer for decimal columns |
| Maps | Leaflet + react-leaflet, dynamically imported to avoid SSR issues |
| Auth | JWT with Passport, bcrypt password hashing |
| Payments | Stripe Payment Element, manual capture, signed webhook |
| Testing | Jest (19 unit tests) |
| CI | GitHub Actions: lint, type-check, tests and build on every push |
| Hosting | Render (web services) + Neon (PostgreSQL) |

### Engineering details worth a look

- **Spatial search** uses PostGIS `ST_DWithin` against GiST-indexed geometry columns, not a bounding-box approximation.
- **Text and city matching** is accent-insensitive through an `IMMUTABLE` SQL expression, backed by a functional index so it stays indexable.
- **Payments use manual capture**, so the client's money is authorised at booking time and only captured when the work is confirmed — the correct model for a marketplace.
- **The webhook verifies Stripe's signature** against the raw request body, which is why the Nest app boots with `rawBody: true`.
- **Reviews are tied to completed bookings** by a unique constraint, so ratings cannot be faked.
- **The API client retries idempotent reads only.** A timed-out `GET` is retried once; a `POST` never is, because repeating one could duplicate a booking or a charge.
- **`/api/health` checks the database, not just the process.** An API that boots but cannot reach its database is down in practice — exactly the failure this project had, unnoticed, for four months. It returns `503` when the database does not answer, so a monitor can actually detect it.
- **Rate limiting is proxy-aware.** Behind Render's proxy, without `trust proxy` every request appears to come from the same address and one attacker would lock out every user.

---

## Architecture

Three-tier client–server. The front end consumes the REST API; the API persists to PostgreSQL/PostGIS and integrates with Stripe.

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
      entities/             TypeORM entities
      common/               Guards, decorators and transformers
      config/               Database config and CLI data source
      database/
        migrations/         Schema history — the only source of truth
        seeds/              Reproducible demo data
  frontend/                 Next.js 14 App Router + Tailwind
    src/
      app/                  Routes, including robots.ts and sitemap.ts
      components/
        atoms/              Button, Input, Badge, Avatar, Spinner
        molecules/          SearchBar, ServiceCard, ServiceImage, Pagination
        organisms/          FilterPanel, ResultsList, ServiceMap, forms
        templates/          DashboardLayout
        layout/             Header, Footer
      lib/                  API client, auth store (Zustand), Stripe, shared constants
      types/                Shared TypeScript types
  diagrams/                 UML diagrams (Mermaid)
  wireframes/               Responsive wireframes
  docs/screenshots/         Images used in this README
  docker-compose.yml
```

---

## Running it locally

### Prerequisites

- Node.js 20 or newer
- Docker and Docker Compose
- A Stripe account in test mode (publishable and secret keys)

### Steps

**1. Clone and start the database**

```bash
git clone https://github.com/Federicojaviermartino/servilocal.git
cd servilocal
docker compose up -d db
```

**2. Configure the back end**

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

**3. Install, migrate and seed**

```bash
cd backend
npm install
npm run migration:run   # creates the schema, including the PostGIS extension
npm run seed            # 16 users, 10 categories, 25 services, 79 reviews
npm run start:dev
```

The API runs at `http://localhost:3001/api`, with interactive Swagger docs at `/api/docs`.

> The schema is created **only** by migrations — `synchronize` is off in every environment, so local and production can never drift apart. In deployed environments pending migrations run automatically at boot.

**4. Configure and start the front end**

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

**5. Optional — test the Stripe webhook locally**

```bash
stripe listen --forward-to localhost:3001/api/payments/webhook
```

Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` and restart the back end.

---

## Testing and quality checks

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
```

The end-to-end suite covers search with accent-insensitive matching, pagination,
city filtering, the collapsible mobile filter panel, the map, demo login, failed
login, route protection, and a full booking paid with a Stripe test card.

The payment test skips itself, with an explicit reason, when Stripe keys are not
configured — the booking is still created, but there is nothing to charge. Add
`STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as repository
secrets to run it for real in CI.

All of these run in CI on every push to `main`. The end-to-end job spins up the
whole stack: a PostGIS container, migrations, the seed, the API and the built
front end.

---

## Deployment

The deployed demo uses:

- **Neon** for PostgreSQL with PostGIS — a free tier that does not expire after 30 days, unlike the alternatives.
- **Render** for two web services, each built from its own Dockerfile: the NestJS API and the Next.js front end.
- **GitHub Actions** for CI and for a scheduled job that keeps both services awake during working hours.

### Environment variables

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
| `PORT` | `3001` |
| `SENTRY_DSN` | Optional. When set, unhandled errors are reported to Sentry |
| `THROTTLE_AUTH_LIMIT` | Optional. Login attempts per minute per IP, default `5`. Only raise it in test environments |

**Front end (`servilocal-web`)**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://servilocal-api.onrender.com/api` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `NEXT_PUBLIC_SITE_URL` | Public site URL, used by the sitemap and Open Graph tags |

`NEXT_PUBLIC_*` variables are injected as Docker build args, because Next.js inlines them at build time. After changing one, redeploy with **Clear build cache** — a restart is not enough.

### Stripe webhook

Register `https://servilocal-api.onrender.com/api/payments/webhook` in the Stripe dashboard for these events:

- `payment_intent.amount_capturable_updated` — marks the booking as confirmed
- `payment_intent.succeeded` — completes the payment
- `payment_intent.payment_failed` — leaves the booking awaiting retry
- `payment_intent.canceled`

---

## Project context

ServiLocal is the Master's thesis project for the *Máster Universitario en Desarrollo de Sitios y Aplicaciones Web* at Universitat Oberta de Catalunya (UOC), 2025/2026.

**Author:** Federico Javier Martino

The application meets the nine assessment requirements of the course, including WCAG 2.1 level AA accessibility, role management, in-app administration and deployment to a public server. The written dissertation, self-assessment report, checklist and defence presentation were submitted through the university's platform and are not part of this repository.

Included here: UML diagrams in [`diagrams/`](diagrams/) and responsive wireframes in [`wireframes/`](wireframes/), both as standalone HTML.

---

## License

Code released under the MIT License. The dissertation text is under Creative Commons Attribution–NonCommercial–NoDerivatives 3.0 Spain.
