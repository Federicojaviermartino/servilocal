# Security Policy

## Reporting a vulnerability

Please report security issues privately to **federicojaviermartino@gmail.com**
rather than opening a public issue. Include the affected URL or endpoint, the
steps to reproduce it, and what an attacker could do with it.

You will get an acknowledgement within 72 hours. This is a portfolio and
thesis project maintained by one person, so please allow reasonable time for a
fix before disclosing publicly.

## Scope

The live demo at `servilocal-web.onrender.com` and its API at
`servilocal-api.onrender.com` are in scope, along with this repository.

The demo holds seeded data only — no real users, no real payments. Stripe runs
in test mode throughout. Please do not run automated scanners or load tests
against it: it is a single free-tier instance and that just takes the demo
down for everyone else. The load test in `scripts/carga/` is there to be run
against your own local copy.

## Dependencies

`npm audit` runs in CI on every push, over production dependencies only. Any
advisory that is not already listed in `auditoria-aceptada.json` fails the
build.

That file records the advisories currently accepted, each with the reason and
an expiry date — after which the build fails again, so a temporary exception
cannot quietly become permanent. Today it is empty: after the NestJS 12 and
Next.js 16 upgrades there are no known advisories in the production
dependencies of either the API or the front end.

## What the application does

- Passwords are hashed with bcrypt; the API never stores or logs them.
- Card details never reach this server. Stripe Elements collects them in the
  browser and the API only ever handles payment intent identifiers.
- Payments are authorised and captured separately, so an amount is only taken
  once the work is marked complete.
- The browser session is a JWT in an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie, so a script running on the page cannot read it or send it
  elsewhere. The browser reaches the API through the front end's own origin,
  which keeps that cookie first-party: `onrender.com` is a public suffix, so
  a cookie set by the API's host would be third-party and Safari would drop
  it. Scripts and API clients get a bearer token from `POST /auth/token`
  instead.
- Requests that change state are rejected when their `Origin` is not the
  front end, which covers cross-site request forgery and login CSRF on top of
  `SameSite`.
- Signing out revokes the session on the server, not just the cookie: each
  token carries its own id, which goes on a revocation list until the token
  would have expired anyway. Only that session is closed — the demo accounts
  are shared by many visitors at once, and one of them signing out must not
  sign out the rest.
- The WebSocket connects straight to the API and authenticates with a
  one-minute ticket signed for a different audience; the API refuses it as a
  session, and the socket refuses a session token.
- Rate limiting per visitor, `helmet` for response headers, and a Content
  Security Policy on the front end. Requests relayed by the front end carry
  the visitor's address, which the API only trusts alongside a secret shared
  by the two services.
- Credentials — the session cookie, bearer tokens and the proxy secret — are
  stripped from everything sent to Sentry, errors and performance traces
  alike, and the SDK is told not to collect request bodies, cookies, local
  variables or conversations with the assistant in the first place. A test
  sends a sign-in, password included, through the real SDK and fails if any
  of it comes out.
- Administrative actions are written to an append-only audit log with no
  foreign key to users, so the record survives the deletion of the account
  that produced it.

## Known gaps

These are open, listed here rather than left implicit:

- There is no staging environment; `main` deploys straight to the demo.
- Accessibility conformance is partial and documented separately in
  [ACCESSIBILITY.md](ACCESSIBILITY.md).
