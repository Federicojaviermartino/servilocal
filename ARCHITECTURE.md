# Architecture

This document describes how ServiLocal is put together and, where it matters, why.
The [README](README.md) covers what the product does and how to run it; this one is
for anyone reading the code — what the moving parts are, how a request travels
through them, and which trade-offs were taken deliberately.

## Table of Contents

- [System context](#system-context)
- [Runtime topology](#runtime-topology)
- [Request lifecycle](#request-lifecycle)
- [Back end](#back-end)
- [Data model](#data-model)
- [Front end](#front-end)
- [Real time](#real-time)
- [Optional infrastructure](#optional-infrastructure)
- [Decisions](#decisions)
- [Known limitations](#known-limitations)
- [Testing and CI](#testing-and-ci)

---

## System context

```
                      ┌──────────────────────────────────────────┐
                      │            Browser (10 locales)          │
                      └───────────────┬──────────────────────────┘
                                      │ HTTPS
                      ┌───────────────▼──────────────────────────┐
                      │   Next.js 16 · App Router · SSG + CSR     │
                      │   Prerendered once per locale             │
                      │   Relays /api to the API                  │
                      └───────┬───────────────────────┬───────────┘
                     REST/JSON│                       │ WebSocket
                      ┌───────▼───────────────────────▼───────────┐
                      │   NestJS 12 · REST API · Socket.IO        │
                      │   JWT + roles · global validation         │
                      └──┬───────────┬──────────┬─────────┬───────┘
                         │           │          │         │
              TypeORM    │           │ Stripe   │ Redis   │ Anthropic
              migrations │           │ SDK      │ (opt.)  │ (optional)
                         ▼           ▼          ▼         ▼
              ┌────────────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
              │  PostgreSQL 18 │ │ Stripe │ │ Valkey │ │  Claude  │
              │   + PostGIS    │ │        │ │        │ │          │
              └────────────────┘ └────────┘ └────────┘ └──────────┘
                                      │
                                      │ signed webhook
                                      └──────────────► API
```

The browser never calls the API's host for REST: it calls `/api` on the front end,
which relays the request (see [Decisions](#decisions), 9). The WebSocket is the
exception and connects straight to the API.

Everything to the right of PostgreSQL is optional at runtime. Stripe is required for
the payment flow but not for the application to boot; Redis, Sentry and the AI layer
each degrade on their own without taking anything else down. See
[Optional infrastructure](#optional-infrastructure).

## Runtime topology

| Piece | Where it runs | Notes |
|-------|---------------|-------|
| `servilocal-web` | Render web service, own Dockerfile | `next start`. `NEXT_PUBLIC_*` variables are build args: Next inlines them, so changing one needs a redeploy with **Clear build cache**. `src/proxy.ts` relays `/api/*` to the API |
| `servilocal-api` | Render web service, own Dockerfile | Nest with `rawBody: true`, global prefix `/api`, `trust proxy: 1` |
| PostgreSQL + PostGIS | Neon | SSL with certificate validation. Free tier that does not expire |
| Key Value (Valkey) | Render, optional | Must be in the **same region** as the API: Render's private network does not cross regions |
| CI + keep-warm | GitHub Actions | Tests on every push, plus a scheduled job that keeps both services awake during working hours |

The API sits behind Cloudflare, which sits in front of Render. That chain is the reason
the rate limiter does not trust `req.ip` — see [Decisions](#decisions). The front end sits
behind Cloudflare too, which shapes how it relays requests to the API (decision 9).

## Request lifecycle

Order matters here, and one ordering detail drove a design choice.

```
  request
    │
    ├─ request id (AsyncLocalStorage)                    (Express middleware)
    │     one per request: in the response, in every log line
    │     written while serving it, and in Sentry
    │
    ├─ helmet · CORS · cookie-parser · rawBody capture
    │
    ├─ ThrottlerVisitanteGuard                           (global guard)
    │     keyed on the visitor the front end relays, if the
    │     shared secret matches; else CF-Connecting-IP; else req.ip
    │
    ├─ OrigenGuard                                       (global guard)
    │     rejects state-changing requests from a foreign Origin
    │
    ├─ AuthGuard('jwt') → RolesGuard                     (route guards)
    │     token from Authorization: Bearer or the session
    │     cookie, audience and revocation checked;
    │     populate request.user
    │
    ├─ ValidationPipe (whitelist, forbidNonWhitelisted)  (global pipe)
    │  ParseUUIDPipe on every :id                        (param pipe)
    │
    ├─ SoloLecturaInterceptor                            (global interceptor)
    │     blocks non-GET/HEAD/OPTIONS for read-only accounts
    │
    ├─ controller → service → repository
    │
    └─ FiltroDeExcepciones                               (global filter)
          structured logging, Sentry capture without
          any credential
```

**Why the read-only rule is an interceptor and not a guard.** Nest runs global guards
*before* route guards. A global guard would read `request.user` before
`AuthGuard('jwt')` had set it, find `undefined`, and let everything through.
Interceptors run after guards, when the user is resolved. The same interceptor denies
by HTTP method rather than by a list of forbidden routes, so a new destructive endpoint
is blocked without anyone having to remember to register it.

## Back end

`backend/src` is organised by feature, with cross-cutting concerns under `common/`.

| Module | Responsibility |
|--------|----------------|
| `auth` | Registration, login, JWT issuing, Passport strategy |
| `users` | Account administration, activation and deactivation |
| `categories` | Hierarchical tree, cached read path |
| `services` | Publishing and geospatial search |
| `bookings` | State machine, notification triggers |
| `payments` | Stripe intents with manual capture, signed webhook |
| `reviews` | Reviews tied to completed bookings, reports, moderation |
| `messages` | Direct messaging between client and provider |
| `notifications` | Persisted notices, pushed over the socket |
| `auditoria` | Append-only record of administration actions |
| `admin` | Aggregated metrics and provider reputation |
| `ia` | Optional assistant layer with a hard spend ceiling |
| `health` | Liveness that checks the database, not just the process |
| `common` | Guards, interceptors, filters, Redis, real-time gateway |

Aggregates are computed in SQL, not in the browser. The admin panel used to download
the full list of users, categories and reviews just to count their lengths; the metrics
endpoint now returns them already aggregated.

## Data model

Eleven entities, all UUID-keyed, all managed through TypeORM migrations.

```
User ──< Service >── Category ──┐
 │         │                    └── self-referencing parent/children
 │         │
 │         └──< Booking >── User (client)
 │                │
 │                ├──< Payment
 │                └──< Review        (UNIQUE on bookingId)
 │
 ├──< Conversation >──< Message
 ├──< Notification
 └     RegistroAuditoria             (no foreign key — see below)

UsoIa                                (UNIQUE on fecha + funcionalidad)
```

Constraints worth naming:

- **`Review` is unique per booking**, and a booking must be `completed` before it can be
  reviewed. That rules out ratings from people who never hired anything; it does not rule
  out collusion, since a provider with a second account can book their own service
  through it. A raised cost, not a guarantee.
- **`Service.location` and `User.location`** are PostGIS geometry columns with GiST
  spatial indexes. Search uses `ST_DWithin`, not a bounding box.
- **City and text matching** go through an `IMMUTABLE` accent-stripping SQL expression
  with a functional index behind it, so it stays indexable rather than degrading to a
  sequential scan.
- **`RegistroAuditoria` has no relation to `User`.** The actor's email is copied into the
  row as it stood at the time. A foreign key with cascading delete would erase the
  history exactly when the account it describes is deleted — which is when the history
  is most needed.
- **`UsoIa` accumulates with `ON CONFLICT DO UPDATE`** in PostgreSQL, never in process
  memory: on a free tier the instance sleeps several times a day, and a ceiling built on
  an in-memory counter only looks like a ceiling.

Schema changes are migrations, never `synchronize`. `backend/src/database/migrations`
holds them in order; each one is reversible.

## Front end

**Routing and locales.** `next-intl` with `localePrefix: 'as-needed'`: Spanish is the
default and carries no prefix, so `/services/search` and `/en/services/search` are the
same page in two languages, and previously published URLs stay valid. Ten locales,
listed once in `src/i18n/routing.ts`, which is also the source for `generateStaticParams`,
the language picker, the `hreflang` alternates and the RTL flag.

**Rendering.** Every page is prerendered once per locale at build time rather than
translated in the browser, so a crawler and a first-time visitor receive the same HTML.
Interactive screens hydrate into client components from there.

**Components** follow Atomic Design under `src/components`: `atoms` (Button, Input,
Badge, Spinner…), `molecules` (SearchBar, Pagination, ServiceCard…), `organisms`
(BookingForm, CheckoutForm, ServiceMap, GraficasPanel, CampanaAvisos…) and one
`template` (DashboardLayout). Storybook renders them inside the same locale provider and
theme tokens as the application, so a card can be checked in Arabic on a dark background
without starting the API.

**Theming** uses semantic tokens — components name the role of a colour (`bg-superficie`,
`text-principal`), never the colour itself — applied by a blocking inline script before
first paint, so there is no flash of the wrong theme. Chart colours are read from the
same CSS variables as the rest of the UI.

**State and data.** The session itself is an `HttpOnly` cookie the interface cannot
see. A small Zustand store remembers *who* is signed in, never the token, so the header
renders without waiting for the network, and asks the API once per page load whether
the session still stands; a `401` clears it, a timeout does not. Everything else is
fetched per screen through the axios client in `src/lib/api.ts`, which calls `/api` on
its own origin. That client retries
idempotent reads only: a timed-out `GET` is retried once, a `POST` never, because
repeating one could duplicate a booking or a charge.

Screens load through `useCarga`, which tells "nothing there" apart from "could not ask"
— a failure shows a retry, an expired session a way back in — and derives *loading* by
comparing what was last requested with what last arrived, instead of setting it inside an
effect. State that lives outside React — the theme class on `<html>`, whether the socket
is connected — is read with `useSyncExternalStore`, so every reader sees the same value.
The lint runs with the React compiler's rules at their default level and fails on any
warning.

## Real time

One Socket.IO gateway, `TiempoRealGateway`, under `common/` rather than inside the
messaging module, because notifications travel over the same connection.

- **One private room per person**, `usuario:<id>`. Clients never ask to join a room; the
  server places them after verifying the token. Opening a second connection for
  notifications would have doubled the socket slots for nothing.
- **The handshake carries a one-minute ticket, not the session.** The socket connects
  straight to the API, so it has no cookie; the browser asks `/auth/socket-ticket` for a
  ticket before each attempt, reconnections included. Tickets and sessions are signed
  for different audiences, so neither opens the other's door.
- **`identificar()` verifies the ticket *and* checks the account is still active**,
  because a token stays syntactically valid after an account is deactivated.
- **The server never stores notification text.** It stores the type and the data to
  interpolate; the interface composes the sentence from the reader's catalogue. Storing
  "Your booking is confirmed" would freeze that notice in Spanish even if the reader
  switches to German tomorrow. Title and content remain as a fallback: an unknown type
  shows a generic translated sentence, never a raw key.
- **Creating a notification never throws.** If confirming a booking failed because the
  notice about the confirmation could not be saved, the cure would be worse than the
  disease.

With `REDIS_URL` set, the `@socket.io/redis-adapter` spreads events across instances;
without it, delivery is limited to the instance holding the connection.

## Optional infrastructure

The rule across the whole codebase: **nothing optional throws at boot, and nothing
optional takes anything else down.**

| Piece | Present | Absent |
|-------|---------|--------|
| Redis / Valkey | Throttler counters survive deploys, sockets span instances, category reads are cached | Throttler counts in memory, sockets stay on one instance, reads go to the database |
| Sentry | Errors and sampled traces reported, with the session cookie, bearer tokens and the proxy secret stripped from both | Reporting off, a log line says so |
| Anthropic key | Assistant active under a hard monthly ceiling checked *before* each call | A null provider fails immediately with a typed cause and the caller takes its deterministic path |

Redis connections are split by purpose: queries fail fast (`enableOfflineQueue: false`),
subscriptions queue — the socket adapter issues `psubscribe` before the connection is up,
and failing that call fast kills the API at boot.

The read cache treats every failure — disconnection, corrupt JSON, a cold instance — as
a miss. It exposes `recordar(key, seconds, compute)`, with no method that can return an
error, so an optional accelerator can never become a single point of failure. Entries
are short-lived on purpose: a cache that expires on its own does not need manual
invalidation at every write, and forgetting to invalidate is among the most tiresome
bugs to track down.

## Decisions

Each of these was a fork in the road; the alternative is recorded because the reason it
was rejected is the useful half.

**1 · The rate limiter keys on `CF-Connecting-IP`.**
`trust proxy: 1` made `req.ip` the last entry of `X-Forwarded-For`, which on Render is an
internal load balancer — and it changes between requests, so one visitor landed in two
counters while everyone behind the same balancer shared a third. Reading
`X-Forwarded-For` directly is worse: Cloudflare *concatenates* rather than sanitises, so
position 0 is whatever the client claims. `CF-Connecting-IP` cannot be forged — send it
yourself and Cloudflare answers `403` at the edge. Raising `trust proxy` to 3 also works
today, and was rejected: it assumes exactly two infrastructure hops, which Render
documents nowhere. Requests relayed by the front end are the one exception, covered in
decision 9.

**2 · Payments use manual capture.**
Funds are authorised when the booking is made, not taken — the correct model for a
marketplace, where the money should not move before the service does. The refund path
branches accordingly: a held payment is cancelled, a captured one is refunded. Calling
`cancel` on a captured intent fails, which is a real bug this project had until a test
was written for that branch.

The booking state machine moves the money. Completing a booking captures the hold,
cancelling or rejecting it releases the hold, and the money moves *before* the state does:
if the capture fails, the booking is not marked complete, because a job closed without
being charged is one nobody looks at again. What is still missing is renewing a hold
before Stripe drops it, about seven days in — see [Known limitations](#known-limitations).

**3 · The audit log is append-only and denormalised.**
No route creates, edits or deletes an entry; the service exposes only `anotar` and
`listar`, and a unit test fails if a mutating method ever appears. The actor's email is
copied rather than referenced, so the record survives the deletion of the account it
describes.

**4 · Notification text is composed by the reader, not the writer.**
See [Real time](#real-time). The same principle drives the audit panel: the server
records the action name, the interface translates it, and an unknown name is shown raw
instead of leaving a blank label.

**5 · Lock files are generated on Linux, in a container.**
npm resolves peer dependencies differently per operating system: `next-intl` pulls in
`@swc/core`, which declares `@swc/helpers >=0.5.17` as an optional peer while Next pins
`0.5.5` exactly, and Storybook brings the same clash with `ajv`. Linux resolves each into
two entries, Windows into one, and `npm ci` rejects the Windows tree outright.
`npm run lock` rebuilds the tree inside a `node:22` container and refuses to write the
file until `npm ci` accepts it.

**6 · `/api/health` checks the database.**
An API that boots but cannot reach its database is down in practice — exactly the failure
this project had, unnoticed, for four months. The endpoint returns `503` when the
database does not answer, so a monitor can detect it.

**7 · Service pages keep a single canonical URL.**
Interface strings are translated, but the text a provider writes about their own service
is not. Ten URLs whose main content is identical Spanish are ten near-duplicates, so
every locale's service page points its canonical at the default locale. Pages whose
content *is* fully translated — the search page, for instance — declare their own
canonical per locale instead.

**8 · Vitest on both sides.**
The front end came first: `use-intl` is ESM-only and Jest could not load it. The back
end followed with NestJS 12, whose packages ship as ESM only. The application itself
stays CommonJS — Node loads ESM from CommonJS since 22.12 — but Jest has its own module
system and can only do the same from Node 24.9, which would have meant testing on a
different Node than production runs. Vitest loads them natively. The back end compiles
tests with SWC rather than Vitest's default esbuild, because Nest's dependency injection
reads constructor types from decorator metadata and esbuild does not emit it.

**9 · The browser reaches the API through the front end.**
The session token used to live in `localStorage`, where any script that ran on the page
could read it and replay it from elsewhere until it expired. An `HttpOnly` cookie fixes
that, but only if the browser sends it, and `onrender.com` is on the Public Suffix List:
`servilocal-web` and `servilocal-api` are different *sites*, so a cookie set by the API
would be third-party, and Safari blocks those. Moving both services under one custom
domain would have fixed it too, at the cost of a domain the demo does not have.

So the browser calls `/api` on the front end, and `src/proxy.ts` relays it. Three things
that make this less simple than a one-line rewrite:

- **Next's rewrite forwards every incoming header**, and the front end is behind
  Cloudflare as well: relayed as is, `CF-Connecting-IP` would reach the API's edge,
  which answers `403` to anyone who sends it. The proxy strips Cloudflare's headers and
  the forwarding ones before relaying.
- **Every relayed request comes from the front end's address**, so the rate limiter
  would put all visitors in one bucket — five login attempts a minute for everyone. The
  proxy sends the visitor's `CF-Connecting-IP` as `X-Visitante-IP`, and the API believes
  it only alongside a secret the two services share (`PROXY_SECRETO`), compared in
  constant time. Anyone can call the API directly and send that header; without the
  secret it changes nothing.
- **The socket cannot use the cookie**, because it connects straight to the API. Before
  each connection attempt it asks for a one-minute ticket, signed for a different
  audience than the session. A ticket lifted from the page opens the socket and nothing
  else; the session does not open the socket.

Browsers still send the cookie on their own, so every state-changing request is checked
against `Origin` as well as relying on `SameSite=Lax`. Clients without a browser get a
bearer token from `POST /auth/token`, which never sets a cookie — `/auth/login` never
returns the token, so there is no way for page scripts to receive it.

Signing out revokes the session on the server as well as deleting the cookie: every token
carries its own `jti`, which goes into `sesiones_revocadas` until the token would have
expired anyway. It is per session rather than per account because the demo accounts are
shared by many visitors at once.

Running the end-to-end suite on WebKit, which is what the whole detour is for, found two
things Chrome and Firefox never showed. `upgrade-insecure-requests` in the CSP made Safari
request every script over `https://localhost`, so locally the page never hydrated; the
directive is now left out when the API is on localhost. And a `Secure` cookie received over
`http://localhost` is stored but never sent back, which is why the cookie is `Secure` when
the request arrived over HTTPS — always, in production — rather than whenever `NODE_ENV` is
`production`.

## Known limitations

Stated here rather than discovered later.

- **The audit entry is not written in the same transaction as the action it records.** If
  the write fails, the action has already happened and goes unrecorded; the gap is
  reported in the server log. Closing this would mean wrapping every administrative
  action and its entry in one transaction, and blocking an urgent moderation because the
  history is unavailable was judged the worse outcome. A decision, not an oversight.
- **Socket delivery is per-instance without Redis.** With one instance — the current
  deployment — this changes nothing; it becomes real the moment a second one starts.
- **A hold lasts seven days.** Funds are authorised at booking time, captured when the
  provider marks the job complete, and released when the booking is cancelled or
  rejected. But Stripe drops an uncaptured authorisation after about a week, so a
  booking left open longer than that can no longer be charged: completing it fails at
  capture and the booking stays open rather than being marked paid. Re-authorising
  before the hold lapses is not implemented.
- **Cached reads expire by time, not by event**, except for the category tree, which is
  invalidated explicitly on write. Everything else can be at most one TTL stale.
- **The free tier sleeps.** Cold starts are visible on the first request after an idle
  period; the scheduled workflow only covers working hours.

## Testing and CI

| Layer | Tool | What it protects |
|-------|------|------------------|
| Back end | Vitest + SWC | Services and controllers, including the money paths and the guard metadata that keeps admin routes admin-only |
| Back end, against real infrastructure | Vitest + PostGIS + `stripe-mock` | What a double cannot contradict: that the spatial index is actually usable, that a row lock serialises two transactions, that Stripe rejects a non-integer amount |
| Front end | Vitest | Library helpers, components, and catalogue parity across the ten locales |
| End to end | Playwright | Chrome on desktop and on a narrow phone, Firefox and Safari's WebKit, against a real API and database |
| Accessibility | `@axe-core/playwright` | WCAG 2.1 A/AA, in both light and dark themes |
| AI assistant | Evaluation set, `src/ia/evaluacion` | 48 messages in ten languages with the category and city each should yield. The dictionary path runs in CI; the model path runs by hand, since each case is a paid call, through the same prompt and validation as production |
| Components | Storybook | Built in CI, because a broken story breaks nothing in production and would otherwise rot unnoticed |
| Production | Smoke test after each deploy | Waits until each service reports the commit it should now serve — each Render service redeploys only when its own folder changes — then checks the relay, the cookie attributes, the socket handshake and that sign-out revokes the session |

The catalogue test is worth singling out: it checks that the ten translation files have
the same sections, the same keys, no empty strings, and the **same ICU placeholders**.
A missing key does not break the build — it shows as a blank label, in one language,
which nobody is looking at.

Two habits, learned the hard way, apply to the tests themselves: a test must be shown to
fail before it is trusted, and a test that asserts on the wrong side of a condition
passes just as green as one that works.
