# Changelog

Notable changes to ServiLocal, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow
[Semantic Versioning](https://semver.org/) for the project as a whole: a major version
means that something a user or an API client relied on stops working, a minor one adds
without breaking. The `/api/v1` prefix is a separate thing — it versions the shape of the
resources, and has not changed since it was introduced.

Versions up to 2.0.0 were tagged after the fact, on the commit that closed each stage of
the project, and carry that commit's date.

## [2.10.0] — 2026-09-30

### Fixed

- Filtering by maximum price answered 400 and left the search in error: the front end
  sent `maxPrice`, and the API only knows `priceMax`.
- The radius filter filtered nothing. It went without coordinates, and the API ignores
  it without them: someone in Valencia set 5 km and got results from all over Spain.
  Searching near you now uses the browser's location, rounded to about a kilometre and
  never stored, and the radius only appears with it. The home page no longer promises a
  deposit and an instant confirmation: the whole amount is held, and the provider
  confirms.
- The results page was not in the address, so coming back from a service opened on
  page 3 landed on page 1.
- On a phone, a service's price and "Book" came after all its reviews. On a desktop,
  the sticky booking card and the dashboard navigation slid under the fixed header.
- A booking of 42 € on a service "from 40 €" could not be made, because the amount went
  in steps of 5 from the minimum. Service prices now take cents too.
- Signing in again went to the dashboard's home or the home page instead of back where
  the person was, and registering ignored where they had come from.
- The booking summary showed the date as `2026-10-01`.
- Stripe's card form has no Catalan, Galician or Basque and picked a language of its
  own; those three now get Spanish.
- A service page that failed to load for lack of network offered no way to retry.
- Galician mixed "fontanería" with the category's normative "fontanaría".

### Accessibility

- Dark-mode contrast: the secondary button (2.06:1), form errors (3.71:1), the focus
  outline (2.45–2.90:1) and the map pop-ups (2.5:1). Errors have their own token per
  theme.
- A rating showed as five disabled buttons named "Rate with N stars", and the score only
  by colour. Showing one is now an image named after it, and choosing one is a group of
  radio buttons.
- The language selector no longer navigates while the keyboard moves through it: it is a
  button that opens a list of links.
- A conversation has a heading with the other person's name, says who wrote each message
  and announces new ones as they arrive.
- Forms validate in the page's language, next to each field, instead of in the
  browser's bubbles and in the browser's language.
- "Sign out" is named by what it shows, and the edit and delete buttons of a service
  name the service.
- After accepting a booking, the list stays and focus goes to its card.
- A booking's description and cancellation reason take their own text direction.
- Reflow is checked at 320 px, where a seven-page pagination did not fit.

### Changed

- The search page arrives with its heading, search bar and filters, and the results
  stream in from the server. It used to arrive empty until the browser had run. The
  search bar is a real form, so pressing "Search" before the JavaScript has loaded, or
  without it, still searches.
- Providers can reply to reviews from their service's page, and reach the detail of a
  received booking from the list.
- Drafts kept when a session expires belong to the account and are cleared on sign-out,
  and a tab reloads when another signs in with another account.
- Pages carry their own Open Graph title and a default image, and private pages no
  longer claim the home page as their canonical URL.
- The about, privacy and terms pages are generated at build time.
- The socket client loads when the socket opens instead of on every page, and the
  message catalogue sent to the browser leaves out what only the server uses.
- The privacy policy declares the location used to search near you. New accounts
  record their acceptance of the version of 30 September.

### Tests

- The search is tested as the server serves it — a promise read with `use()` — and the
  address, the API parameter names and the server request each have their own tests.
- Accessibility checks cover a service page in both themes, form errors and the client
  dashboard in dark mode, and reflow is measured at 320 px.

## [2.9.0] — 2026-09-29

### Security

- Anyone with the demo passwords, which are on the sign-in page, could rewrite the
  catalogue everyone sees, publish fake listings or leave reviews, and nothing put it
  back. Every hour, whatever the demo accounts changed more than an hour earlier in
  services, profiles and reviews now goes back to a copy the seed keeps; what they
  published is deleted, or withdrawn if it already has bookings; and the reviews they
  wrote are deleted, with the ratings recomputed. The dashboard warns demo users that
  it will happen. A service's photos must be `https` links, ten at most, and each
  visitor can publish twenty services an hour.
- The read-only demo administrator, whose password is public too, could read real
  accounts: through a reported review it reached a real booking, whose description is
  free text the mask does not cover, and the providers' reputation showed full
  surnames. It now sees only the demo's world: a real account's profile, booking or
  payment answers 404, and the moderation queue and the reputation list only the
  demo's, with surnames shortened. Reporting a review follows booking and messaging:
  each world only reports its own.
- A service's reference address, required when publishing and often the provider's
  home, went to anyone: in the search, the service page and a provider's list, and in
  the bookings, payments and reviews of the other party. The interface never showed
  it. Now only its owner sees it, through the new `GET /services/mine`.
- Public reviews carried the reviewer's full surname, city and id; they now show the
  first name and the initial.
- Opening a conversation marked its messages as read inside a `GET`, which a read-only
  account could do and a link from another site could trigger. It is now
  `PATCH /messages/conversation/:partnerId/read`, which the page calls only when
  there is something unread.
- The password limit from 2.4.0 counted 72 characters, while bcrypt reads 72 bytes:
  forty Arabic letters passed, and the last four did not count. It now counts bytes.
- Password recovery answers as soon as it knows email is available, and stores the
  link and calls the email provider afterwards, so its timing no longer tells whether
  an account exists. The email no longer greets anyone by name: addresses are not
  verified at sign-up, so the name could have been typed by someone else and sent, in
  a genuine ServiLocal email, to an address that never asked for it.
- The rate limiter counts IPv6 addresses by their /64.
- Errors were logged, and sent to Sentry, with the full URL, so a failed search
  recorded what someone had searched for. The query string is left out.
- The map's marker icons came from unpkg.com, which received every visitor's address.
  The front end serves them now, and the CSP no longer allows that host.
- Deleting an account replaces its email in the moderation history with the anonymised
  one.

### Changed

- The privacy policy says what any visitor can see, gives a private contact email
  instead of the public repository, and declares the moderation history, the drafts
  kept in the browser tab when a session expires, and Stripe among the international
  transfers. The terms no longer say that the demo accounts cannot be modified: they
  can, and what is changed with them is undone an hour later. New accounts record their
  acceptance of the version of 29 September.
- SECURITY.md lists two more known gaps: what the missing `PROXY_SECRETO` does today —
  every visitor reaching the API through the front end shares a single visitor's
  limits — and that registration reveals whether an email has an account.

### Tests

- Integration tests against PostgreSQL and PostGIS for the demo restore — rewritten,
  withdrawn and new services, profiles, reviews and ratings, and changes less than an
  hour old left alone —, for the demo administrator's world, including the reputation,
  and for the moderation history after an account is deleted.
- The recovery route is tested over HTTP with an email that never finishes sending,
  and fails if it waits for it.

## [2.8.0] — 2026-09-29

### Fixed

- A card declined and then replaced with another in the same form left the money held
  in Stripe and the payment marked failed for good: nobody could capture it, cancelling
  did not release it, and Stripe dropped it after seven days. A declined card now only
  records the reason, and the payment stays pending, as Stripe lets the client retry on
  the same intent. Paying, confirming, completing, cancelling and the hourly review ask
  Stripe for the intent's current state, so payments already stuck recover on their
  own, and the review also reconciles pending and failed payments of the last eight
  days, which covers webhooks that never arrived.
- A request the provider left unanswered stayed pending forever, and its hold was
  renewed on the client's card every four days. An hourly job now cancels it once its
  date has passed, releases the hold and tells both parties.
- The client could cancel a confirmed booking after its time, with the work possibly
  done, releasing the hold. Now only the provider or the administration can, and the
  booking page says so.
- A deactivated provider's services could still be booked and paid from a direct link.
- Changing a service's category answered with the new one and kept the old.
- Deleting a category that still had services answered 500; it now answers 409 with its
  code, and the database refuses it too.
- A `null` in a required field of an edit — a service's title or city, a profile's
  name, a category's name — reached the database and answered 500; it is now a 400.
- `page=1e308` in the public search answered 500, and `page=1.5` was accepted.
- Completing without charge sent the "completed without charge" notice even when the
  client had paid in between and the hold was captured.
- Two messages at once between the same people could open two conversations.
- A longitude of 0 switched the distance filter off.
- A second operation on a booking locked by a payment waited for the 30-second
  statement timeout and answered 500; it now gives up after five seconds with a 409.
- The seed, run from a machine outside UTC, stored every date shifted; the API and the
  seed now run in UTC.

### Changed

- Status changes the administration makes on other people's bookings, and the services
  it withdraws, are recorded in the audit log.
- Billed revenue in the admin metrics counts captured payments, not the price of every
  completed booking: with the demo data it showed 80,686 € billed and nothing captured.
- Search honours the provider's coverage radius: a service only shows up within the
  smaller of the two distances.
- Lists return their most recent rows: 100 for the public ones, 200 for each person's,
  500 accounts in the admin panel.
- Branch protection on `main` requires the seven CI jobs, for administrators too.

### Tests

- Integration tests against PostgreSQL for what doubles cannot show: two conversations
  racing on a warm connection pool, a category change actually saved, the database
  refusing to delete a category with services, a pending request expiring, the coverage
  radius and the revenue query joining payments.

## [2.7.1] — 2026-09-29

### Fixed

- Since 2.6.0 the API exited with code 1 every time it shut down, and on Render's free
  plan that is every time it goes to sleep. It closed Redis before the HTTP server and
  the sockets, and the socket adapter, unsubscribing from its channels over a closed
  connection, left a rejection that nobody caught. Redis now closes last. An
  integration test shuts the application down against a real Valkey, which CI now
  runs, and CI also stops the API image with `SIGTERM` and requires it to exit
  with 0.
- The keep-awake ping let both services fall asleep several times a day: GitHub
  started the five-minute schedule up to 35 minutes late. A run now starts every ten
  minutes, off the hour, checks both services once, and then stays for 45 minutes
  calling them every four. Those calls go to `/salud` and to a new
  `GET /api/health/vivo`, which does not touch the database, so the database can
  still suspend between checks.
- The ping's check stopped at the first `curl` that could not connect, without the
  retry and without saying which service had failed.

### Changed

- `render.yaml` deploys on every commit to `main` again, not after CI checks pass.
  Render holds a deploy back if any check on the commit fails, and the post-deploy
  smoke test and the keep-awake ping hang off the same commit: the smoke test waits
  for that very deploy, and a ping failing during an outage would hold back the fix.
  Branch protection requiring CI is what should keep a red commit out of `main`;
  it is not set up yet.
- `react-hook-form` 7.89.

### Documentation

- The CI badge follows `main`: it turned red whenever a Dependabot proposal failed.
- Redis moves to done in the roadmap; it has been in production for a while.
- The release dates of 2.4.0 and 2.6.0 follow their tags, and the 2.7.0 entry no
  longer counts the routes, which it got wrong.

## [2.7.0] — 2026-09-29

### Added

- Screenshots of every main screen, retaken from the running application by
  `frontend/scripts/capturas.mjs` so that they can follow the interface: home, search as
  a list and on the map, dark mode, Arabic, service detail, the search assistant, a
  booking seen by the client and by the provider, messages, demo access, the admin panel
  and two on a phone. The ones in the README were still those of 1.1.0.
- `API_INTERNA`, the address the front-end server uses to reach the API when it is not
  the one the browser uses. Unset, it falls back to `NEXT_PUBLIC_API_URL`, as before.

### Changed

- `docker compose up --build` runs the whole application as it is deployed, and the
  README says how to seed it. The previous file started development servers inside the
  production images, which are installed without development dependencies and could
  not run them; passed the API address to the front end at run time, when Next only
  reads it at build time; and left the front end's server calling `localhost` inside
  its own container.
- The home headline is balanced across its lines instead of leaving one word alone on
  the last.

### Fixed

- Service titles and descriptions, reviews, providers' replies and bios take their own
  text direction, as messages already did: in Arabic, a Spanish title was cut off at
  the wrong end.
- Opening a conversation scrolled the whole window to the latest message, and the header
  and first messages ended up out of view. Only the list scrolls now.
- The demo access cards on the sign-in page broke email addresses mid-word in three
  narrow columns; there is one account per row now.

### Documentation

- The API reference in the README lists every public route, grouped, and says that
  each one also answers under `/api/v1`.
- Corrected: Stripe's secret key is checked when the API starts, not optional until
  someone pays; the locale file is `proxy.ts`, not `middleware.ts`; the mobile
  end-to-end project is a Pixel 5 at 393 px, with the narrowest layouts checked at
  375 px; the PostgreSQL versions that had drifted from the diagrams are gone; the
  version and test badges are current.

## [2.6.0] — 2026-09-29

### Added

- The API checks its whole environment before opening the port and refuses to start,
  listing every problem, when something required is missing or malformed: a secret, a
  number that is not a number, a switch that is not exactly `true` or `false`, an origin
  with a path. In production it also refuses the example `JWT_SECRET`. A deploy that
  does not start never replaces the running one.
- One JSON line per request in the API's log, with the request id that error screens
  show as their reference code.
- `render.yaml` describes both Render services, and `docs/OPERATIONS.md` covers
  deploying, rolling back with and without migrations, restoring the database, seeding,
  watching production, rotating secrets and the free-plan limits. `migration:revert` and
  `migration:show` scripts to go with it.
- The smoke test opens an issue when it fails and closes it when it passes again. A
  missing `PROXY_SECRETO` is a warning until the repository variable
  `HUMO_EXIGIR_PROXY` is set, so red means something again.
- The CI summary lists the end-to-end tests that only passed on a retry, by name, and
  the Playwright report is kept for every run, not only failed ones.

### Changed

- Search filters and the list or map view live in the URL: they survive a new text
  search, going back and reloading, and a link opens what was on screen.
- The booking page tells a service that does not exist from one that could not be
  loaded, and lets you retry the second. Sending a review no longer reloads the page and
  wipes what was being written in the others.
- In the admin panel, your own account and one its owner deleted cannot be toggled, and
  the button says why; rejections are explained by their code; percentages follow the
  language.
- Messages take their own text direction, so Arabic reads right to left on a Spanish
  page, long words wrap, and the input has a name and the API's 2000-character limit.
- Shutting down is graceful: Nest closes the database, Redis and the hold scheduler on
  `SIGTERM`, and the front-end image runs Next directly so that the signal reaches it.
- Base images pinned by version and digest and watched by Dependabot; Ubuntu 24.04 and
  `stripe-mock` pinned in CI; a time limit on every job; superseded runs cancelled
  outside `main`; Playwright browsers cached; the front-end image is started in CI, not
  only built. The keep-awake ping runs every five minutes.
- Coverage now measures the pages, the JWT strategy, the real-time gateway and the hold
  scheduler, and the floors sit a few points under what is measured.

### Fixed

- `robots.txt` left `/dashboard` itself open to crawlers: the rule had a trailing slash.
- The sitemap only listed the first 50 services.
- A booking's description had no length limit; it now takes up to 2000 characters, like
  a message.
- The dashboard summary asked for bookings while redirecting an administrator.
- A notification that arrived before the live connection was up, or during a cut, only
  showed after reloading. The bell now catches up whenever the socket connects or
  reconnects, and a list fetched just before a notification, which arrives after it,
  no longer wipes it from the screen.

### Tests

- A deactivated account loses access with the token it already had, checked against
  the database and not only with a double that always returned an active user.
- Pages had no unit tests: the admin panel, search, booking, reviews, dashboard, public
  pages and the sitemap now do.
- Two end-to-end tests passed without testing what they said: the live notification
  accepted any unread count, and the provider inbox never pressed "Accept". Fixing the
  first one is what uncovered the missed notifications above.

## [2.5.0] — 2026-09-28

### Added

- A form that fails because the session has expired says so, links to sign in again and
  back to the same page, and keeps what was being written: a booking, the profile, a
  service, a review or a message comes back after signing in.
- Cancelling or rejecting a booking asks first and lets you write a reason, which the
  other party sees in the booking. Cancelling used to happen on a single click.
- The admin charts carry their data in a table for screen readers.

### Changed

- Amounts are written the way each language writes them: "45,50 €" in Spanish,
  "€45.50" in English. They read "45.5 euros" in every language, and a service card said
  "30 per hour" with no currency at all.
- The service page arrives with its content in the HTML: the service and its reviews are
  fetched on the server. It used to arrive as skeletons, so search engines and link
  previews saw nothing, not even the title.
- API errors are explained in the page's language from their code, never with the API's
  own message: sign-in, registration and payment used to show it as it came, in Spanish
  or in English. New codes for an email already in use, wrong credentials, a deactivated
  account and the payment conflicts.
- Every private page has its own translated title and asks not to be indexed. Terms,
  privacy and about have their own canonical URL; they used to declare the home page's.
- The payment summary says "Amount to hold" when the card is only held.
- The privacy policy names Cloudflare and OpenStreetMap, which receive the visitor's IP
  address.
- The admin charts load on their own, so Recharts no longer weighs on the panel.

### Fixed

- Accessibility: registration errors are tied to their fields and a name that is too
  long says why; closing the assistant gives focus back to its button; four pages had a
  `<main>` inside the layout's, and the axe check now covers landmarks; map markers have
  names; the list and map switch says which view is active; changing page moves focus to
  the results and respects reduced motion; the review comment box had no name.
- Arabic: the arrows of the pagination, the back link and the send button point the
  right way, the admin tabs follow the reading direction with the arrow keys, and
  notifications appear on the left.
- The confirmation for deleting a category was written in Spanish in every language.

### Security

- After signing in, the page only goes on to paths of the application. A link carrying
  `redirect=https://…` could send someone who had just signed in to a page asking for
  the password again.
- The front end sends HSTS, as the API already did.
- Signing in checks the password before saying that an account is deactivated, and
  compares against a dummy hash when the email does not exist, so neither the answer nor
  the time it takes reveals which emails are registered.

## [2.4.0] — 2026-09-28

### Added

- The account can be managed from the profile: change the password, which asks for the
  current one and closes every other session; download everything the platform keeps
  about you as a JSON file; and delete the account.
- Password recovery by email, sent through Brevo in the language the page was in. The
  link lasts an hour, works once and is stored only as a hash, and an account receives
  at most three an hour. Without a Brevo key the API says recovery is unavailable
  instead of pretending to send.
- Registration asks people to confirm they are of legal age and accept the terms and the
  privacy policy, and records when they did and which version they accepted.
- The payment page says the card is saved at Stripe to renew the hold, and that it is
  erased with the account.

### Changed

- Deleting an account anonymises it. Personal data and the card saved at Stripe are
  erased; bookings, payments, reviews and messages stay, without the name, because they
  are part of other people's history and payments must be kept for tax purposes. It is
  refused with open bookings, for demo accounts and for administrators.
- Email addresses are stored and matched in lower case: an account registered as
  "Ana@…" could not sign in as "ana@…".
- The privacy policy and the terms describe what the application actually does: the
  session cookie, the saved card, holding and capturing the payment, completing without
  charge, the hosting providers, and the rights that can now be exercised from the
  profile.

### Fixed

- The profile page did not load for clients or providers. It asked for an
  administration-only route and got a 403, so nobody but an administrator could edit
  their own profile.
- A phone number, postal code or address longer than its column reached the database
  and came back as a 500; it is now refused with a 400.

### Security

- Changing or recovering the password invalidates every session issued before it,
  including one opened with a stolen password.
- Passwords longer than 72 characters are refused: bcrypt ignores whatever comes after,
  so only the beginning had to be guessed.

## [2.3.1] — 2026-09-26

### Fixed

- The overlap constraint from 2.3.0 was missing in production. Three demo bookings,
  created by an automated test and confirmed on top of one another, stopped its
  migration from adding it; the migration logged them and carried on, as designed, and
  the API kept refusing new overlaps at confirmation. A new migration adds the
  constraint wherever it is still missing, once no overlapping bookings are left, and
  says so in the log; while some remain, it names them instead.

## [2.3.0] — 2026-09-26

### Added

- Services state how long each booking takes, from 15 minutes to 8 hours and one hour by
  default. The booking keeps its own copy, and the service page, the booking form and
  the booking show it.
- Completing a booking with nothing held no longer happens silently. The API answers 409
  with a code, and the provider chooses: wait for the client to pay, or complete it
  without charge. A booking completed without charge can still be paid by the client,
  and is charged at once rather than held; the client is told so.
- The provider is notified of every new booking request. The notification was in the
  catalogue; nothing sent it.

### Changed

- A service with bookings is withdrawn instead of deleted: it leaves search, the
  provider's list and its public page, and its bookings, payments and reviews stay. With
  pending or confirmed bookings it cannot be removed until they are resolved.
- The admin capture and refund routes act only on a booking in a state that allows it —
  capture on a completed booking, refund on a closed one — and both go to the audit log.
- Prices below 0.50 euros, the least Stripe charges, are rejected when publishing a
  service or booking one.
- Calls to Stripe time out after 10 seconds with two retries, and database connections,
  statements and idle transactions have time limits, so a slow dependency no longer
  leaves requests hanging with rows locked.
- Rules the API already enforced — prices, ratings, coverage radius, durations — are also
  database constraints, and the foreign keys that listings filter on are indexed.

### Fixed

- A booking could be made for a past date and completed, and so charged, before its
  date, and two confirmed bookings of the same provider could overlap. Past dates and
  dates more than a year ahead are rejected, completing waits for the date, and an
  exclusion constraint keeps a provider's confirmed bookings apart even when two are
  confirmed at the same moment.
- Status changes and payment events raced each other: a provider completing while the
  client cancelled could both succeed, leaving a cancelled booking with the money
  charged. Each status change now runs in one transaction with the booking locked, and
  every write to a payment locks it too.
- A hold that arrived after the booking was cancelled stayed on the card until Stripe
  dropped it a week later, and then both parties were asked to pay again for a booking
  that no longer existed. It is released on arrival; one that arrives after completion
  is captured.
- Cancelling before paying left the payment open, so the client could still finish
  paying from a tab left open. The payment is cancelled with the booking.
- A cancellation was always notified to the provider, even when the provider cancelled.
  The other party is notified now, and both when an admin cancels.
- Deleting a service cascaded to its bookings, and with them to payments and reviews.
  Those foreign keys now restrict the deletion.
- Paying again for a confirmed booking whose hold was lost said the provider still had
  to accept it, and the received-bookings page had "a las" hard-coded in Spanish.

### Security

- Creating bookings and sending messages have their own limits per visitor, 10 and 30 a
  minute, so a provider's inbox cannot be flooded with fake requests.

## [2.2.0] — 2026-09-26

### Fixed

- Providers could not publish a service. The form sends no coordinates and the API
  required them, so every attempt ended in a 400 shown as "the service could not be
  created"; no test covered it. A service without coordinates is now placed in its
  city, and an end-to-end test publishes one from the dashboard.
- Public search answered 500 to a malformed category id, and malformed ids or
  duplicates did the same elsewhere. Identifiers are validated as UUIDs, and database
  errors that are the request's fault answer 400 or 409.
- A rejected message was not reported: the text stayed in the box and nothing said it
  had not been sent.

### Security

- The read-only demo administrator, whose password is public, could read every
  user's email, phone, address and home location, and the emails in the moderation
  log. Its responses now mask them.
- The demo accounts are isolated from real ones: they can book and message each
  other, but not a real account, and the other way round. The rejection carries a
  stable code, so the interface explains it in every language.
- A booking returned the other party's whole profile from the start. Now each side
  sees only name, avatar and city until it is confirmed, then the contact details;
  home coordinates never.
- A message needs a recipient that exists, is active and is someone else.
- The seed refuses a non-local database unless it is named in `SEMILLA_CONFIRMAR`,
  checks its settings before deleting anything, and runs in one transaction.

## [2.1.2] — 2026-09-26

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

### Fixed

- The post-deploy smoke test waited for a version that never came when several commits
  were pushed at once: Render deploys the last commit of the push to every service whose
  folder changed, not the last commit that touched that folder. It now accepts that
  commit or any later one.

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

[2.8.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.7.1...v2.8.0
[2.7.1]: https://github.com/Federicojaviermartino/servilocal/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/Federicojaviermartino/servilocal/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.1.2...v2.2.0
[2.1.2]: https://github.com/Federicojaviermartino/servilocal/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/Federicojaviermartino/servilocal/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/Federicojaviermartino/servilocal/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.4.0...v2.0.0
[1.4.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Federicojaviermartino/servilocal/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Federicojaviermartino/servilocal/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/Federicojaviermartino/servilocal/releases/tag/v0.9.0
