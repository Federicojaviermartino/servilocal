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
cannot quietly become permanent. Every entry there today is waiting on a major
framework upgrade, and each says which one.

## What the application does

- Passwords are hashed with bcrypt; the API never stores or logs them.
- Card details never reach this server. Stripe Elements collects them in the
  browser and the API only ever handles payment intent identifiers.
- Payments are authorised and captured separately, so an amount is only taken
  once the work is marked complete.
- JWT for authentication, rate limiting per IP, `helmet` for response headers,
  and a Content Security Policy on the front end.
- Administrative actions are written to an append-only audit log with no
  foreign key to users, so the record survives the deletion of the account
  that produced it.

## Known gaps

These are open, listed here rather than left implicit:

- The session token lives in `localStorage`, which is readable by any script
  that manages to run on the page. The CSP is the mitigation, not a fix.
- There is no staging environment; `main` deploys straight to the demo.
- Accessibility conformance is partial and documented separately in
  [ACCESSIBILITY.md](ACCESSIBILITY.md).
