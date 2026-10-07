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

The demo is seeded, and registration is open, so real accounts can exist
next to the demo ones. There are no real payments: Stripe runs in test mode
throughout. Please do not run automated scanners or load tests
against it: it is a single free-tier instance and that just takes the demo
down for everyone else. The load test in `scripts/carga/` is there to be run
against your own local copy.

## Dependencies

`npm audit` runs in CI on every push and again every Monday, over production
dependencies only: an advisory is published when it is published, not when
someone pushes. Any advisory that is not already listed in
`auditoria-aceptada.json` fails the build.

That file records the advisories currently accepted, each with the reason and
an expiry date — after which the build fails again, so a temporary exception
cannot quietly become permanent. Today it is empty: after the NestJS 12 and
Next.js 16 upgrades there are no known advisories in the production
dependencies of either the API or the front end.

## What the application does

- Passwords are hashed with bcrypt; the API never stores or logs them. Their
  length is capped at 72 bytes rather than characters, because bcrypt ignores
  whatever comes after: forty Arabic letters passed a 72-character check and
  lost their last four.
- Card details never reach this server. Stripe Elements collects them in the
  browser and the API only ever handles payment intent identifiers.
- Stripe's events are accepted only with a valid signature over the raw
  body. A test sends them over HTTP, signed as Stripe signs them: an altered
  body, another secret or no signature answer 400.
- Payments are authorised and captured separately, so an amount is only taken
  once the work is marked complete, and a booking cannot be completed before
  its date. The administration's manual capture and refund act only on a
  booking in a state that allows them.
- The browser session is a JWT in an `HttpOnly`, `Secure`, `SameSite=Lax`
  cookie, so a script running on the page cannot read it or send it
  elsewhere. The browser reaches the API through the front end's own origin,
  which keeps that cookie first-party: `onrender.com` is a public suffix, so
  a cookie set by the API's host would be third-party and Safari would drop
  it. Scripts and API clients get a bearer token from `POST /auth/token`
  instead.
- Forms that carry a password or an email are sent by POST, also before the
  page's JavaScript has loaded, when the browser sends them on its own: the
  registration form used to go by GET then, with the password in the address.
- Requests that change state are rejected when their `Origin` is not the
  front end, which covers cross-site request forgery and login CSRF on top of
  `SameSite`. No `GET` changes anything: opening a conversation used to mark
  it as read, which a link from another site could trigger, and that is now
  a `PATCH` of its own.
- Who may call each route is tested as a whole, not guard by guard: an
  integration test boots the application as it runs in production and calls
  every route as an anonymous visitor, a client, a provider, an administrator
  and the read-only demo administrator. The list of routes comes from the
  application itself, so a new route without a row in that table fails the
  build until someone decides who may call it.
- Whose it is, is tested the same way. A role says what kind of account may
  call a route, not whose booking it names: with real rows, each route that
  names a booking, a payment, a review, a conversation or a notification is
  called as its owner, as another client, as another provider and as the
  administration.
- Request bodies are validated without converting types on the way. With
  implicit conversion, a `"false"` sent as text where a boolean goes was read
  as `true`: it recorded the terms as accepted, and completed a booking
  without charge. It is now refused.
- The API client encodes every identifier it puts in a path, so a crafted
  one cannot walk to another route.
- What someone was typing when their session expired is kept in the tab under
  their account and cleared when they sign out, so the next person to sign in
  there does not inherit a half-typed phone number. If another tab signs in with
  another account, or signs out, this one reloads: the cookie is shared, and it
  would otherwise save into the new account.
- Signing out revokes the session on the server, not just the cookie: each
  token carries its own id, which goes on a revocation list until the token
  would have expired anyway. Only that session is closed — the demo accounts
  are shared by many visitors at once, and one of them signing out must not
  sign out the rest.
- Revoking a session, changing the password, deactivating an account or
  deleting it also closes that account's open sockets. They used to stay
  connected, receiving messages and notifications, until the tab was closed.
  A socket comes back only by asking for a new ticket, which takes a session
  that still stands.
- Changing or recovering the password invalidates every session issued before
  it, so one opened with a stolen password is closed too. Recovery links last
  an hour, work once, are stored only as a SHA-256 hash, and an account
  receives at most three an hour. The response is the same whether the
  account exists or not, and so is its timing: the API answers as soon as it
  knows it can send email, and stores the link and calls the email provider
  afterwards. The email greets nobody by name, because addresses are not
  verified at sign-up and the name may have been typed by someone else.
- People can download all their data and delete their account from the
  profile. Deletion anonymises the account, erases the card saved at Stripe
  and replaces the account's email in the moderation history with the
  anonymised one; bookings, payments and reviews stay without the name,
  because other people's history depends on them.
- Signing in answers the same way, and in the same time, whether the email
  exists or not: without an account the password is still compared, against a
  dummy hash of the same cost, and a deactivated account only says so once the
  password has been checked. After signing in, the page only goes on to paths
  of the application, so a crafted link cannot hand the visitor over to
  another site.
- The WebSocket connects straight to the API and authenticates with a
  one-minute ticket signed for a different audience; the API refuses it as a
  session, and the socket refuses a session token.
- Rate limiting per visitor, with IPv6 addresses counted by their /64: a
  connection gets a whole block, and rotating through it was free. `helmet`
  sets the response headers, and the front end sends a Content Security
  Policy and HSTS. Creating bookings, publishing services and sending
  messages have their own, tighter limits, so nobody can flood an inbox with
  fake requests or the catalogue with fake listings. Requests relayed by the
  front end carry the visitor's address, which the API only trusts alongside
  a secret shared by the two services.
- Credentials — the session cookie, bearer tokens and the proxy secret — are
  stripped from everything sent to Sentry, errors and performance traces
  alike, and the SDK is told not to collect request bodies, cookies, local
  variables or conversations with the assistant in the first place. A test
  sends a sign-in, password included, through the real SDK and fails if any
  of it comes out. Errors are logged and reported with their path but not
  their query string, which can carry what someone searched for.
- The API checks its configuration before it starts. In production it
  refuses to run with the example `JWT_SECRET` from `backend/.env.example`,
  which is public, and without allowed origins; a secret shorter than 32
  characters, a missing proxy secret or a missing webhook secret is reported
  in the log. Values that
  may carry credentials, such as database or Redis URLs, are never echoed.
- Administrative actions — manual captures and refunds, status changes on
  other people's bookings and services withdrawn included — are written to an
  append-only audit log with no foreign key to users, so the record survives
  the deletion of the account that produced it. The one thing a deletion
  changes there is the deleted account's email, replaced by the anonymised
  one: the decision stays on record, not who it concerned.
- Bookings, payments and reviews cannot be deleted by cascade: a service with
  bookings is withdrawn, not deleted, so the other party's history stays.
- The demo accounts, whose passwords are on the sign-in page, are kept apart
  from real ones. They can book, message and report reviews among
  themselves, but not with a real account, and a real account cannot do any
  of that with them. Whatever they
  change in services, profiles and reviews goes back every hour, once it has
  been left alone for an hour, to a copy the seed keeps; what they publish is
  deleted, or withdrawn if it already has bookings. The read-only demo
  administrator sees every screen of the panel but only the demo's data — a
  real account's profile, booking or payment answers 404, and the providers'
  reputation lists only the demo's — with surnames shortened and email
  addresses, phone numbers, postal addresses and locations masked. Its
  metrics are counted over the demo's accounts, and the moderation history,
  which records what was done to real accounts, comes back empty. Until
  2.13.0 anyone with the demo password could read both whole.
- A booking shows each party only the other's name, avatar and city until it
  is accepted; phone, email and address follow once it is confirmed. Home
  coordinates never leave the API.
- Public pages show what a listing needs and no more: a provider's name,
  city, bio and photo; each service without its reference address, which
  only its owner sees, not even the other party of a booking; and reviewers
  by first name and initial. Service photos must be `https` links, ten at
  most.
- The seed script empties the database before filling it, so it refuses any
  host that is not local unless the database is named in `SEMILLA_CONFIRMAR`.
- The weekly copy of the database, once it is set up, is encrypted with age
  before it touches the runner's disk: the repository is public, and so are
  its workflow artifacts to anyone signed in to GitHub. Only the public key is
  there; the private one is kept outside.

## Known gaps

These are open, listed here rather than left implicit:

- There is no staging environment; `main` deploys straight to the demo.
- `PROXY_SECRETO` is not set in the demo yet, so the API cannot tell apart
  the visitors whose requests come through the front end, which is every
  request a browser makes. They share the limits as if they were a single
  visitor: 120 requests a minute in general, and five a minute to sign in,
  register, recover or change a password, so five attempts by anyone lock
  everybody else out of those for the rest of the minute. Bookings and
  messages share 10 and 30 a minute, and publishing services 20 an hour.
  `GET /api/health` reports `atravesDelFrontend`, which turns `true` once
  the secret is set on both services.
- Sign-in attempts are limited per visitor, five a minute, and not per
  account: attempts spread across many addresses are not slowed down for any
  one account.
- There is no second factor, not even for administrators.
- A password needs eight characters and nothing else. It is not checked
  against lists of common or leaked passwords.
- A session lasts 24 hours from sign-in, with no idle timeout, and no screen
  lists the open sessions or closes the others; changing the password does
  close them.
- The Content Security Policy allows inline scripts (`'unsafe-inline'` in
  `script-src`), which the theme script and the framework's own need while
  there are no nonces. It limits where a script could send what it reads,
  not whether an injected one runs.
- Registration answers `409` when an email is already in use, so it tells
  anyone whether an address has an account, which sign-in and recovery are
  careful not to. Closing it means answering the same either way and sending
  a verification or "you already have an account" email instead, and email
  addresses are not verified at all yet.
- Accessibility conformance is partial and documented separately in
  [ACCESSIBILITY.md](ACCESSIBILITY.md).
