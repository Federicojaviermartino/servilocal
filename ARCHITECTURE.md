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
              │  PostgreSQL    │ │ Stripe │ │ Valkey │ │  Claude  │
              │   + PostGIS    │ │        │ │        │ │          │
              └────────────────┘ └────────┘ └────────┘ └──────────┘
                                      │
                                      │ signed webhook
                                      └──────────────► API
```

The browser never calls the API's host for REST: it calls `/api` on the front end,
which relays the request (see [Decisions](#decisions), 9). The WebSocket is the
exception and connects straight to the API.

Everything to the right of PostgreSQL is optional at runtime except Stripe's secret key,
which the API checks with the rest of its environment before starting. No call reaches
Stripe until someone pays, so a test-mode key is enough to run everything else; Redis,
Sentry, email and the AI layer each degrade on their own without taking anything else
down. See
[Optional infrastructure](#optional-infrastructure).

## Runtime topology

| Piece | Where it runs | Notes |
|-------|---------------|-------|
| `servilocal-web` | Render web service, own Dockerfile | `next start`. `NEXT_PUBLIC_*` variables are build args: Next inlines them, so changing one needs a redeploy with **Clear build cache**. `src/proxy.ts` relays `/api/*` to the API |
| `servilocal-api` | Render web service, own Dockerfile | Nest with `rawBody: true`, global prefix `/api`, `trust proxy: 1` |
| PostgreSQL + PostGIS | Neon | SSL with certificate validation. Free tier that does not expire |
| Key Value (Valkey) | Render, optional | Must be in the **same region** as the API: Render's private network does not cross regions |
| CI + keep-warm | GitHub Actions | Tests on every push, plus a scheduled job that keeps both services awake during working hours |

Both services are described in [`render.yaml`](render.yaml), and how to deploy, roll
back, restore the database and rotate secrets is in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

**Starting and stopping.** The API checks its whole environment before opening the port
(`src/config/entorno.ts`): a missing secret, a number that is not a number, a switch that
is not exactly `true` or `false` or an origin with a path stops it, with every problem
listed at once. A deploy that does not start never replaces the running one. On the way
down, shutdown hooks let Nest close the database pool, Redis and the hold scheduler when
Render sends `SIGTERM`, and both images run their server directly as the main process so
that the signal reaches it. That makes Node process 1 in the container, where a re-raised
signal is ignored, so once everything is closed the API exits explicitly; and Redis gets
three seconds to acknowledge its `QUIT` before the connection is cut, so a Redis
restarting at that moment cannot keep the process alive until Render kills it. The log
says which signal arrived and, last, the code the process exits with.

**Logs.** One JSON line per request — method, path without the query string, status,
milliseconds and request id — besides the formatted lines Nest writes. The request id is
the reference code an error screen shows, so a report can be traced to its line. The line
is written when the connection closes, not when the response finishes, so a request the
client gave up on is logged too, marked `abortada`: those are the slow ones. Nest's own
lines carry colour codes only in a terminal; in Render's log they arrived as text.

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
    │     shared secret matches; else CF-Connecting-IP; else req.ip;
    │     IPv6 addresses by their /64
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
          structured logging and Sentry capture, without
          credentials or the query string
```

**Why the read-only rule is an interceptor and not a guard.** Nest runs global guards
*before* route guards. A global guard would read `request.user` before
`AuthGuard('jwt')` had set it, find `undefined`, and let everything through.
Interceptors run after guards, when the user is resolved. The same interceptor denies
by HTTP method rather than by a list of forbidden routes, so a new destructive endpoint
is blocked without anyone having to remember to register it. That only holds while no
`GET` writes anything. One did: opening a conversation marked it as read, so a read-only
account could do it and a link from another site could trigger it. Marking a thread as
read is now a `PATCH` of its own.

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
| `demostracion` | Hourly restore of whatever the demo accounts changed |
| `admin` | Aggregated metrics and provider reputation |
| `ia` | Optional assistant layer with a hard spend ceiling |
| `health` | Liveness that checks the database, not just the process |
| `common` | Guards, interceptors, filters, Redis, real-time gateway |

Aggregates are computed in SQL, not in the browser. The admin panel used to download
the full list of users, categories and reviews just to count their lengths; the metrics
endpoint now returns them already aggregated.

## Data model

Thirteen entities, all UUID-keyed, all managed through TypeORM migrations.

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
SesionRevocada                       (keyed by the token's jti; see decision 9)
RestablecimientoContrasena >── User  (password-recovery links, stored as a hash)
```

Constraints worth naming:

- **`Review` is unique per booking**, and a booking must be `completed` before it can be
  reviewed. That rules out ratings from people who never hired anything; it does not rule
  out collusion, since a provider with a second account can book their own service
  through it. A raised cost, not a guarantee.
- **`Service.location` and `User.location`** are PostGIS geometry columns with GiST
  spatial indexes. Search uses `ST_DWithin`, not a bounding box: first with the radius
  asked for, which the index on `location::geography` can serve, then with each
  provider's coverage radius, which changes from row to row and no index can. It pages
  with `offset` and `limit` rather than TypeORM's `skip` and `take`, which with joins add
  a `SELECT DISTINCT` of every match, and an index on `createdAt` serves its default
  order. With 50,000 services, a broad text search went from 1.6 s to 21 ms in the
  database. The location columns are written as GeoJSON, because TypeORM converts every
  value for a spatial column with `ST_GeomFromGeoJSON`: the profile used to pass EWKT
  text, and saving a location failed with a 500 that only a test against PostGIS could
  show.
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
- **A provider's confirmed bookings cannot overlap.** An exclusion constraint, GiST over
  `providerId` and a `tsrange` from `scheduledDate` to `scheduledDate + durationMinutes`
  and limited to `confirmed`, rejects the second of two overlapping confirmations even
  when both arrive at once and neither transaction can see the other. The API turns the
  error into a 409 with a code. Intervals are half-open, so back-to-back bookings fit.
  The API also checks at confirmation, so a database without `btree_gist`, or with
  overlapping bookings from before the constraint existed, still refuses new overlaps;
  the migration then skips the constraint and says why in the log instead of stopping
  the deploy. A later migration adds it wherever it is still missing, once those
  bookings have been resolved: that is how production got it, after three demo bookings
  created by an automated test had blocked it.
- **Deleting an account anonymises it.** The row stays, because bookings, payments and
  reviews of other people point to it, but names, email, phone, address and location are
  erased, the password is replaced by one nobody knows, and the card saved at Stripe is
  deleted there. The person's services with bookings are withdrawn and emptied, the rest
  are deleted, and notifications and recovery links go with the account.
- **History does not cascade.** Bookings, payments and reviews restrict the deletion of
  the users, services and bookings they point to. A service with bookings is withdrawn
  (`withdrawnAt`) instead of deleted, and one with open bookings cannot be removed until
  they are resolved.
- **What the API validates, the database checks too**: prices of at least 0.50 euros,
  the least Stripe charges, ratings from 1 to 5, the coverage radius and the duration.
  The constraints are added `NOT VALID` and then validated, so a legacy row can leave one
  unvalidated, with a warning in the log, but cannot stop a deploy. The foreign keys
  that listings filter on are indexed.

Schema changes are migrations, never `synchronize`. `backend/src/database/migrations`
holds them in order; each one is reversible.

## Front end

**Routing and locales.** `next-intl` with `localePrefix: 'as-needed'`: Spanish is the
default and carries no prefix, so `/services/search` and `/en/services/search` are the
same page in two languages, and previously published URLs stay valid. Ten locales,
listed once in `src/i18n/routing.ts`, which is also the source for `generateStaticParams`,
the language picker, the `hreflang` alternates and the RTL flag. The picker is a list of
links rather than a drop-down that navigated on change, which moved the page as soon as
the keyboard went through it.

**Rendering.** Every page is prerendered once per locale at build time rather than
translated in the browser, so a crawler and a first-time visitor receive the same HTML.
Interactive screens hydrate into client components from there. The public service page
also fetches its data on the server: the service and its reviews come with the same
`cache()`d request its metadata uses, so the HTML already carries the title, the price
and the reviews. If the API does not answer, the page fetches them from the browser
instead, and only a real 404 from the API turns into a 404 page.

The search page is server-rendered too, but without waiting for its results. It used
to be a client component whose HTML carried no heading, no filters and not a single link
to a service. Now the server reads the address — filters, view and page all live in it,
so the back button and a shared link give the same search — starts the request, and
hands the unresolved promise to the client component, which reads it with `use()` inside
a `Suspense` boundary. The heading, the search bar and the filters arrive at once; the
results stream in when the API answers. An API that has been asleep takes about a minute,
so the server gives up after eight seconds and the browser asks instead, saying that the
server is waking up. Changing a filter or a page is a navigation, and the page is served
again for the new address.

Static pages set their locale with `setRequestLocale`, so they are generated at build
time instead of being rendered on every request. Pages that can be shared carry their own
Open Graph block and a default image, generated by `scripts/imagen-social.mjs`: in
Next.js a page's `openGraph` replaces the layout's instead of merging with it, so pages
that set only a title were shared with the home page's.

**Errors and expired sessions.** The API sends a stable code with every rejection the
interface has to explain, and the page picks its own sentence in its language; the API's
message, which is in Spanish, is never shown. A submission that fails because the session
has expired says so, links to sign-in and back to the same page, and leaves what was being
written in `sessionStorage`, where the form picks it up when it opens again. Drafts are
keyed by account and cleared on sign-out, so the next person in that tab does not inherit
a half-typed phone number; and if another tab signs in with another account or signs
out, this one reloads, because the cookie is shared and it would otherwise save into the
new account.

Forms are `noValidate`. The browser's own validation spoke in the browser's language,
not the page's, in a bubble that disappears; `useValidacion` reads the same rules the
fields declare (`required`, `min`, `type="email"`...) on submit and shows each error next
to its field, translated, with focus on the first.

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
`refrescar` fetches again without going back to *loading*, for after a change: a list
that turned into a spinner took the keyboard focus with it.
The lint runs with the React compiler's rules at their default level and fails on any
warning.

**Weight.** The socket client is imported when the socket opens, not with the page: it
was 42 KB on every page, including for visitors who have nothing to listen to. The message
catalogue sent to the browser leaves out the namespaces only server components use —
metadata, the about page, the legal notice, the 404 and the footer — and a test fails if
a client component starts using one of them. Splitting the catalogue per route would save
more, at the cost of a provider per page.

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
| Sentry | Errors and sampled traces reported, with the session cookie, bearer tokens and the proxy secret stripped from both, and no request bodies, cookies, local variables or assistant conversations collected at all | Reporting off, a log line says so |
| Anthropic key | Assistant active under a hard monthly ceiling checked *before* each call | A null provider fails immediately with a typed cause and the caller takes its deterministic path |
| Brevo key | Password-recovery emails, in the language the page was in | Outside production the email is written to the log, so the flow can be tried locally; in production the API answers 503 and the page says recovery is unavailable |

Redis connections are split by purpose: queries fail fast (`enableOfflineQueue: false`),
subscriptions queue — the socket adapter issues `psubscribe` before the connection is up,
and failing that call fast kills the API at boot. They close last, once the HTTP server
and the sockets are down: closed earlier, the socket adapter's unsubscribes were rejected
with nobody to catch them, and every shutdown exited with code 1. The client speaks
RESP3, so the server has to be Redis 6 or later, or any Valkey. CI runs a Valkey for
that shutdown order only; what Redis shares between instances — the throttler count,
the cache, a message crossing from one instance's socket to another's — was checked by
hand with two APIs on one Valkey, and again with Redis switched off, to see the same
checks fail.

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
decision 9. IPv6 addresses are counted by their /64: a connection is given a whole block,
and taking a new address for every request was free.

**2 · Payments use manual capture.**
Funds are authorised when the booking is made, not taken — the correct model for a
marketplace, where the money should not move before the service does. The refund path
branches accordingly: a held payment is cancelled, a captured one is refunded. Calling
`cancel` on a captured intent fails, which is a real bug this project had until a test
was written for that branch.

The booking state machine moves the money. Completing a booking captures the hold,
cancelling or rejecting it releases the hold, and the money moves *before* the state does:
if the capture fails, the booking is not marked complete, because a job closed without
being charged is one nobody looks at again. Nor does a booking close uncharged without
anyone deciding it: with nothing held, completing answers 409 with a code, and the
provider either waits for the client to pay or completes it without charge. The client
can still pay afterwards, and that payment is captured at once instead of held.

Every status change runs in one transaction with the booking row locked, and every write
to a payment — the status change, the webhook, the browser's confirmation, the admin
routes — locks the payment row, always booking first and payment second, so two of them
never wait on each other crosswise. A hold that arrives after the booking closed is
resolved on arrival: released if it was cancelled or rejected, captured if it was
completed. Captures and refunds carry idempotency keys, and Stripe calls time out after
ten seconds with two retries, which bounds how long a row stays locked while Stripe
answers; whoever waits on that row gives up after five seconds with a 409
(`lock_timeout`) instead of hanging for the thirty of the statement timeout.

A declined card does not close a payment: Stripe leaves the intent waiting for another
payment method, and the form lets the client retry on it. So `payment_failed` only
records the reason and the payment stays pending; a payment is marked failed only when
its intent is cancelled. Webhooks are applied with a table of allowed transitions,
because they arrive late and out of order; the paths that ask Stripe for the intent's
current state — confirming, opening the payment page, completing, cancelling and the
hourly review — may also take a payment out of failed, since a cancelled intent never
comes back. That is how payments stuck by the earlier behaviour recover on their own.

A hold does not outlive seven days, and a booking can be weeks away, so holds are
renewed. Paying saves the card to a Stripe customer (`setup_future_usage: off_session`),
and an hourly review inside the API — started at boot, because the free tier sleeps —
places a new hold on the same card once the current one is four days old, then releases
the old one. The new hold is saved first, so Stripe's cancellation event for the old one
finds no payment to mark failed. Each payment is reviewed in its own transaction with
`FOR UPDATE SKIP LOCKED`, and the renewal carries an idempotency key, so neither a second
instance nor a retry after a lost response can hold twice. When the bank wants the
cardholder present, or the card no longer works, the hold is released, the payment is
marked failed and both parties are notified; the client authorises again from the
booking. The same review reconciles what a missed webhook left behind: held payments,
and every payment left pending or failed in the last eight days.

A request the provider leaves unanswered until its date can no longer be accepted, so
another hourly job cancels it, releases the hold and tells both parties. Once the time
of a confirmed booking has passed, the client can no longer cancel it — the work may
be done, and cancelling releases the money —; the provider or the administration can.

**3 · The audit log is append-only and denormalised.**
No route creates, edits or deletes an entry; the service exposes only `anotar` and
`listar`, and a unit test fails if a mutating method ever appears. The actor's email is
copied rather than referenced, so the record survives the deletion of the account it
describes. The one change it allows is the email of an account its owner deletes, which
is replaced by the anonymised one: the decision stays on record, not who it concerned.

**4 · Notification text is composed by the reader, not the writer.**
See [Real time](#real-time). The same principle drives the audit panel: the server
records the action name, the interface translates it, and an unknown name is shown raw
instead of leaving a blank label.

**5 · Lock files are generated on Linux, in a container.**
npm resolves peer dependencies differently per operating system. ESLint needs `ajv` 6
and the webpack tooling that Storybook brings needs `ajv` 8, each with its own
`ajv-keywords` declared as a peer, and where each copy lands depends on how those peers
are resolved: a lock written on Windows was rejected outright by `npm ci` on Linux.
`@swc/helpers` used to clash the same way, until Next moved to a release that satisfies
both sides.
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

**10 · The demo repairs itself instead of being locked.**
The demo passwords are on the sign-in page, so anyone could rewrite the catalogue that
everyone sees, publish fake listings or leave reviews. Making the demo accounts read-only
would stop that and hide most of what the application does. Instead, the seed keeps a
copy of what the demo shows the public — its services, profiles and reviews — in
`demostracion_original`, and an hourly job inside the API puts back whatever the demo
accounts changed, deletes what they published, or withdraws it if it already has
bookings, and deletes the reviews they wrote, recomputing each service's rating. It only
touches what has been left alone for an hour, so nobody's changes are undone while they
are trying the demo, and the dashboard tells demo users that it will happen. A demo
provider's deleted service is withdrawn rather than deleted, so the job can bring it
back, and publishing is limited to twenty services an hour. The hour is measured on the
database's clock, because timestamps carry no time zone.

The read-only demo administrator is the other half. It sees every screen of the panel,
but only the demo's world: a real account's profile, booking or payment answers 404, as
if it did not exist, and the moderation queue and the providers' reputation list only the
demo's. Reporting a review follows booking and messaging: each world only reports its
own, so neither a demo account can fill the real moderation queue nor a real account's
free-text reason reach the queue that anyone with the demo password can read.

## Known limitations

Stated here rather than discovered later.

- **The audit entry is not written in the same transaction as the action it records.** If
  the write fails, the action has already happened and goes unrecorded; the gap is
  reported in the server log. Closing this would mean wrapping every administrative
  action and its entry in one transaction, and blocking an urgent moderation because the
  history is unavailable was judged the worse outcome. A decision, not an oversight.
- **Socket delivery is per-instance without Redis.** With one instance — the current
  deployment — this changes nothing; it becomes real the moment a second one starts.
- **Renewing a hold can need the client.** Holds are renewed off-session every four
  days (decision 2), but a bank may insist on the cardholder, and then the client is
  asked to authorise again and the booking has no guarantee until they do. Holds placed
  before cards were saved cannot be renewed at all and take the same path. The review
  runs only while the API is awake; if it slept for three days running, Stripe's own
  expiry would arrive through the webhook and be reported the same way.
- **Cached reads expire by time, not by event**, except for the category tree, which is
  invalidated explicitly on write. Everything else can be at most one TTL stale.
- **Lists return their most recent rows only:** 100 for the public ones, 200 for each
  person's bookings, payments and messages, 500 accounts in the admin panel. Nothing is
  paginated beyond that; what is left out is still in each person's data export.
- **A confirmed booking nobody completes keeps its hold.** It is renewed every four days
  until the provider completes or cancels it, or the administration does. Expiring it
  automatically could release money for work already done.
- **Dates are timestamps without a time zone**, read and written in the process's local
  time, so the API and the seed pin themselves to UTC. A script that bypasses them and
  runs outside UTC would still write shifted times.
- **The free tier sleeps.** Cold starts are visible on the first request after an idle
  period; the scheduled workflow only covers working hours.
- **A 404 is rendered by the browser.** Next.js 16 answers `notFound()` with its error
  document and puts the not-found page in the React payload, where the browser renders
  it: with JavaScript, the page is the usual one, with its language, header and message;
  without it, the HTML is empty. The status is 404 and the page is `noindex`, so a crawler
  drops it all the same. Checked with the not-found page stripped down to a heading and
  one level further down the tree: the HTML is the same.
- **The demo restore leaves bookings, payments and messages alone.** They are history
  shared between demo accounts, and undoing them would pull a booking out from under
  someone halfway through trying the flow, so they accumulate until the next seed. Like
  the other hourly jobs, it only runs while the API is awake.

## Testing and CI

| Layer | Tool | What it protects |
|-------|------|------------------|
| Back end | Vitest + SWC | Services and every controller, including the money paths, and that whoever acts is taken from the session, never from the address or the body |
| Back end, against real infrastructure | Vitest + PostGIS + `stripe-mock` + Valkey | What a double cannot contradict: that the spatial index is actually usable, that a row lock serialises two transactions, that a locked row is skipped rather than waited on, that Stripe rejects a non-integer amount, that the entities describe exactly the schema the migrations build, that every migration can be undone and applied again, that shutting down closes the sockets before Redis, and who may call each route: the whole application booted as in production, and every route called as an anonymous visitor, a client, a provider, an administrator and the read-only demo administrator. The routes are listed from the application itself, so a new one without a row in the table fails until someone decides who may call it |
| Front end | Vitest | Library helpers, components, pages, and catalogue parity across the ten locales |
| End to end | Playwright | Chrome on desktop and on a narrow phone, Firefox and Safari's WebKit, against a real API and database |
| Accessibility | `@axe-core/playwright` | WCAG 2.1 A/AA, in both light and dark themes |
| AI assistant | Evaluation set, `src/ia/evaluacion` | 48 messages in ten languages with the category and city each should yield. The dictionary path runs in CI; the model path runs by hand, since each case is a paid call, through the same prompt and validation as production |
| Performance | Lighthouse, in the end-to-end job | Performance, accessibility, best practices and SEO of the home page, the search, a service page and sign-in, against budgets: performance at least 0.85, best practices 0.95, accessibility and SEO 1.00 |
| Test strength | Stryker, by hand and weekly | That the tests notice a change in the code that moves money, decides permissions or masks personal data, not only that they run it |
| Components | Storybook | Built in CI, because a broken story breaks nothing in production and would otherwise rot unnoticed |
| Production | Smoke test after each deploy | Waits until each service reports the commit it should now serve — each Render service redeploys only when its own folder changes — then checks the relay, the cookie attributes, the socket handshake and that sign-out revokes the session |

The catalogue test is worth singling out: it checks that the ten translation files have
the same sections, the same keys, no empty strings, and the **same ICU placeholders**.
A missing key does not break the build — it shows as a blank label, in one language,
which nobody is looking at.

Two habits, learned the hard way, apply to the tests themselves: a test must be shown to
fail before it is trusted, and a test that asserts on the wrong side of a condition
passes just as green as one that works.

Coverage on the API is measured over all of `src`, leaving out only what is tested
another way: entities and migrations, which integration compares and runs; module
declarations and `main.ts`, which the permission matrix and CI's image job boot; and the
seed. It used to be a fixed list of files, and whatever was not on it did not count: the
controllers, or the rules for what each party of a booking sees. Floors sit a couple of
points below what is measured. Payments, bookings, account data, guards and interceptors
have floors of their own, and so do the front end's redirect check, its error texts and
the payment page: a global figure is an average, and an average hides an untested branch
in a small file. In CI, Playwright retries a failed test twice, to tell a flaky test from
a broken one and to keep its trace, but either fails the run, and the summary lists them
apart by name. A stray `.only` is rejected by ESLint and, in CI, by both runners.
