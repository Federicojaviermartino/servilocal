# Changelog

Notable changes to ServiLocal, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow
[Semantic Versioning](https://semver.org/) for the project as a whole: a major version
means that something a user or an API client relied on stops working, a minor one adds
without breaking. The `/api/v1` prefix is a separate thing — it versions the shape of the
resources, and has not changed since it was introduced.

Versions up to 2.0.0 were tagged after the fact, on the commit that closed each stage of
the project, and carry that commit's date.

## [Unreleased]

### Changed

- Dependencies brought up to date where no code change was needed: dotenv 18, date-fns 4,
  zustand 5, jsdom 30, eslint-config-prettier 10, the bcrypt types, and the minor and
  patch releases behind them in both packages.
- ioredis 6, which speaks RESP3 and so needs Redis 6 or later, or any Valkey. TypeORM
  still declares ioredis 5 as a peer, for a Redis query cache this project does not use,
  and that peer is overridden. Checked with two API instances sharing one Valkey: the
  sign-in limit counts across both, the cache lives in Valkey, and a message sent through
  one reaches a socket open on the other.
- TypeORM 1.1. Find options move to the object syntax, and a `where` with a `null` or
  `undefined` value now throws instead of being dropped, which used to turn
  `findOne({ where: { id: undefined } })` into "the first row". That default is kept:
  every query was checked, and none relies on a value being ignored.
- Sentry 11, which streams spans instead of sending transactions, so
  `beforeSendTransaction` no longer runs, and which collects far more by default:
  cookies, request bodies, what people write to the assistant and what it answers, query
  data and local variables. Upgraded as it came, it would have put the session cookie
  back into every sampled trace; the test caught it before it shipped. Collection is now
  switched off explicitly for all of that, spans are
  scrubbed in `beforeSendSpan`, and the streamed lifecycle is fixed in code so an
  environment variable cannot switch the scrubbing off. Either safeguard alone keeps the
  credentials out; the test that sends through the real SDK fails without both.

## [2.1.1] — 2026-09-25

### Fixed

- Saving a location on the profile failed with a 500. The value reached PostGIS as EWKT
  text, and TypeORM converts spatial values with `ST_GeomFromGeoJSON`; the unit tests
  approved the text because a double cannot know that. Services and the seed now write
  GeoJSON too, instead of SQL with the coordinates spliced in.
- Editing a location ignored a coordinate of exactly 0, so the Greenwich meridian, which
  crosses Castellón, could not be saved.
- Coordinates are range-checked: a latitude of 1000 used to be stored.

### Changed

- The API lints with ESLint 10 and typescript-eslint 8, in flat configuration, over the
  whole package including the integration tests, and allows no warnings. The 37 `any`
  it used to tolerate are typed. The front end stays on ESLint 9 until the plugins that
  come with Next's configuration support 10.
- The architecture document counts twelve entities, not eleven, and the thesis UML
  diagrams are labelled as the thesis snapshot they are.

## [2.1.0] — 2026-09-25

### Added

- Payment holds are renewed before Stripe drops them. Paying saves the card to a Stripe
  customer, and an hourly review inside the API places a new hold on that card once the
  current one is four days old, then releases the old one. When the bank insists on the
  cardholder, the hold is released and both parties are notified; the client authorises
  again from the booking. `RETENCIONES_AUTOMATICAS=false` turns the review off.
- Every response carries an `X-Request-Id`, which also appears in the logs, in Sentry and
  on the error screens, so a report can be matched to its log line.
- A smoke test after every deploy waits for each service to serve the new commit, then
  checks production end to end: the proxy, the session cookie, the socket and sign-out.
  `/api/health` and the front end's `/salud` report the commit they serve.
- An evaluation set for the AI assistant: 48 messages in ten languages, each with the
  category and city it should yield. The dictionary path runs in CI; the model path runs
  by hand with `npm run evaluar:ia`, since each case is a paid call.
- End-to-end tests in Firefox and Safari's WebKit, alongside Chrome on desktop and on a
  375 px phone.
- Tests for the admin charts and the map, and an integration test that fails when the
  entities and the migrations describe different schemas.

### Changed

- Signing out revokes the session on the server, so a copied cookie stops working.
- The booking page offers to pay whenever nothing is held, not only while the booking is
  pending, so a confirmed booking whose hold was lost can be paid again.
- Platform-initiated cancellations in Stripe carry a reason, so the webhook no longer
  mistakes a hold released on purpose for one that lapsed.
- Loading state is derived instead of being set inside effects; the front end lints with
  no warnings. Formatting is checked in CI on both packages.

### Fixed

- Text that stayed in Spanish in every language: the booking amount, date and missing
  description, prices and ratings in the services panel, and the price unit on the map.
- WebKit: scripts blocked by `upgrade-insecure-requests` on a local API, and a `Secure`
  cookie that a plain-HTTP environment never sent back.

## [2.0.0] — 2026-09-23

### Changed

- **Breaking:** the browser session moves from a token in `localStorage` to an
  `HttpOnly`, `Secure`, `SameSite=Lax` cookie, and the login response no longer carries
  the token. Scripts get a bearer token from `POST /auth/token`. The front end relays
  `/api` to the API, so the cookie stays first-party, and the socket authenticates with a
  one-minute ticket from `GET /auth/socket-ticket`. The resources keep their shape, so
  the prefix stays `/api/v1`; what breaks is how a script signs in.
- The API moves to NestJS 12, TypeScript 6 and Vitest; the front end to Next.js 16.
- Whether the database certificate is verified is decided in code, not by the connection
  URL.

### Added

- CodeQL static analysis, and gitleaks secret scanning over the whole history.

### Fixed

- Live notifications reach screen readers.

### Security

- Credentials no longer reach Sentry through performance transactions or attached
  cookies.
- No known vulnerabilities left in production dependencies.

## [1.4.0] — 2026-09-22

### Added

- The money loop: completing a booking captures the hold, and cancelling or rejecting it
  releases the hold. If the capture fails, the booking is not marked complete.
- A versioned API under `/api/v1`; `/api` keeps answering.
- Integration tests against PostgreSQL with PostGIS and Stripe's `stripe-mock`.
- A load test for search over a large catalogue.
- A dependency audit gate in CI, and Docker images built from the lockfile and booted in
  CI before they count as good.
- An error screen when rendering fails, instead of a blank page.

### Fixed

- Opening checkout is serialised with a row lock and carries an idempotency key, so two
  tabs or a retry after a lost response no longer leave two holds.
- Search uses the index it was documented to use, and no longer treats the visitor's text
  as a pattern.
- Keyboard access to what only worked with a mouse; a listing that does not exist answers
  404; "you have nothing" is told apart from "the request failed"; the map frames what was
  searched; the dark theme is checked on every page.

### Security

- Next.js 15 and bcrypt 6, closing two unauthenticated remote code execution advisories
  in Next, one of them reachable through the image optimiser.

## [1.3.0] — 2026-09-19

### Added

- Natural-language search: a model turns the request into filters and never decides the
  results, with a monthly spend ceiling kept in PostgreSQL and a dictionary of trades and
  symptoms as fallback.
- Real-time messaging and live notifications over Socket.IO.
- An audit log of moderation, a reputation tab and charted metrics in the admin panel,
  aggregated in SQL, and a read-only demo administrator.
- Optional Redis for rate limiting, sockets and caching; the API runs without it.
- Accessibility checks with axe on every push, and an architecture document.

### Fixed

- A captured payment was "refunded" by cancelling it, which Stripe rejects, leaving the
  client without the money. Held payments are released and captured ones refunded.
- A late Stripe webhook could undo a later state.
- The rate limit counted every visitor behind the load balancer as one.
- Category names and price units stayed in Spanish.

### Security

- Six ways in without being who you claimed to be, including a seeded administrator whose
  password was the public demo password.
- Public search no longer returns providers' email, phone and address.

## [1.2.0] — 2026-09-15

### Added

- Ten languages — Spanish, Catalan, Galician, Basque, English, French, German, Italian,
  Portuguese and Arabic — with the locale in the URL and every page prerendered per
  locale. Arabic is mirrored right to left.
- A component catalogue in Storybook.

## [1.1.0] — 2026-09-14

### Added

- A dark theme built on semantic colour tokens.
- End-to-end tests with Playwright, on desktop and on a phone, including a booking paid
  with a Stripe test card, run in CI against the whole stack.
- A health endpoint that checks the database, and error reporting to Sentry when a DSN is
  configured.
- Information, terms and privacy pages; robots, sitemap, per-page metadata and schema.org
  data.
- One-click demo sign-in, and demo data widened to 25 services in ten cities.
- A scheduled workflow that keeps the demo awake during working hours.
- Loading skeletons, pagination, and one retry for reads that time out.
- ESLint and Prettier on both packages, with type checking and a coverage threshold in
  CI.

### Changed

- The schema is managed by migrations, with `synchronize` off in every environment.
- Search ignores case and accents, and also matches category names.
- The README is rewritten in English.
- Node 22.

### Fixed

- The map showed no markers; "Clear" cleared no filter; accents missing across the
  interface; grids and tabs squashed on narrow screens.

### Security

- Rate limiting per address, and stricter sign-up and sign-in.
- Security headers, with a content security policy that restricts where requests go.
- The database server's certificate is validated.
- The password hash is loaded only where it is needed, and malformed identifiers answer
  400 instead of 500.

## [1.0.0] — 2026-05-29

Final submission of the UOC Master's thesis.

### Added

- An administration panel at `/admin`: users, categories, basic metrics, and reported
  reviews that can be removed or kept.
- An interactive Gantt chart, referenced in Annex E of the thesis.

## [0.9.0] — 2026-04-23

First public beta, deployed on Render.

### Added

- Search for home services by text, category and city.
- Booking with client and provider roles, and a booking page whose actions depend on the
  role and the state.
- Payment through Stripe's Payment Element with manual capture, and a webhook.
- Messaging, reviews and authentication with JWT.
- Docker images, and a database connection by `DATABASE_URL` with SSL.

[Unreleased]: https://github.com/Federicojaviermartino/servilocal/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/Federicojaviermartino/servilocal/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.4.0...v2.0.0
[1.4.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Federicojaviermartino/servilocal/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/Federicojaviermartino/servilocal/releases/tag/v0.9.0
