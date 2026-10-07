# Operations

How ServiLocal is deployed, watched, rolled back and restored. Written for whoever
has to do it at five in the afternoon on a Friday: every procedure is a list of
steps, not an explanation.

## What runs where

| Piece | Where | Notes |
|---|---|---|
| API (`servilocal-api`) | Render, Frankfurt, free plan, Docker from `backend/` | Runs pending migrations when it boots |
| Front end (`servilocal-web`) | Render, Frankfurt, free plan, Docker from `frontend/` | Relays `/api/*` to the API |
| Database | Neon, PostgreSQL 16 with PostGIS | Free plan: compute suspends after five idle minutes |
| CI, smoke test, keep-awake ping, weekly database copy and vulnerability check | GitHub Actions | See `.github/workflows/` |
| Payments | Stripe, test mode | Webhook at `/api/payments/webhook` |
| Email | Brevo | Password recovery only; without a key, recovery answers 503 |
| Errors | Sentry, optional | Off without `SENTRY_DSN` |

The Render side is described in [`render.yaml`](../render.yaml). It only takes
effect once it is linked in Render as a Blueprint (*New → Blueprint*, pick this
repository, and accept the existing services). One of its settings is not what
the dashboard has today, and it matters:

- **`healthCheckPath`**: `/api/health/vivo` and `/salud`. Without one, Render treats a
  deploy as live as soon as the port opens. Both only say that the process answers.
  Render calls the path every few seconds and restarts a service that fails it for a
  minute: with `/api/health`, which queries the database, Neon would never get to
  suspend while the API is awake, and a database outage would turn into a loop of
  restarts that fixes nothing. Whether the database answers is checked at boot, by the
  smoke test and by the hourly round of the keep-awake ping.

Deploys stay on every commit that reaches `main` (`autoDeployTrigger: commit`),
not *After CI Checks Pass*. Render holds a deploy back if any check on the commit
fails, and the head of `main` also carries the post-deploy smoke test, which waits
for that very deploy, and the keep-awake ping, which fails during an outage and
would hold back the commit that fixes it. What keeps a red commit out of `main` is
branch protection: it requires the seven CI jobs, for administrators too, and forbids
force-pushing and deleting the branch. A commit only reaches `main` after passing on its
own branch, as in the procedure below.

## Deploying

1. Work on a branch and push it. CI runs on every branch.
2. When CI is green, move `main` to the branch and push it:
   `git branch -f main <branch> && git push origin main`.
3. Render builds and deploys whichever service's folder changed. Each service
   publishes the commit it serves: `GET /api/health` and `GET /salud` return it as
   `version`.
4. After CI on `main`, the smoke test waits for both services to serve the new
   commit and checks production end to end. If it fails, it opens an issue labelled
   `humo` (or comments on the open one) and closes it once it passes again.
5. Tag the release: `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.

### If the new version does not start

The API checks its environment before opening the port (`backend/src/config/entorno.ts`)
and refuses to start when something required is missing or malformed, listing
every problem at once. A deploy that does not start never replaces the running
one: Render keeps serving the previous version and marks the deploy as failed. Read
the reason in the deploy's log, fix the variable in Render and redeploy.

What stops it: no `JWT_SECRET` or `STRIPE_SECRET_KEY`; in production, no
`DATABASE_URL`/`DB_HOST` or no `CORS_ORIGINS`/`FRONTEND_URL`, or the example
`JWT_SECRET`; a number that is not a number; a switch that is not exactly `true` or
`false`; a URL that does not parse; an origin with a path or a trailing slash. What
only warns: a `JWT_SECRET` under 32 characters, a missing `PROXY_SECRETO` and a missing
`STRIPE_WEBHOOK_SECRET`.

## Migrations

They run when the API boots, all pending ones in a single transaction: if one fails,
none is applied and the API does not start, which leaves the previous version
serving.

Rules for writing them:

- **Every migration has a working `down()`.** On every push, the integration suite
  applies the whole chain to an empty database, undoes it one migration at a time until
  nothing is left, and applies it again.
- **Expand, then contract.** Renaming or dropping a column that the running code
  uses breaks it during the deploy, while the old instance still serves, and makes
  rolling back impossible. Do it in two releases: first add the new column and
  write to both; once that release is live, remove the old one.
- **Data fixes are idempotent and tolerant**: they skip, and say so in the log,
  when the data is not what they expect, rather than failing the boot.

To see where production stands, from a checkout of the deployed commit:

```bash
cd backend
DATABASE_URL='<production URL>' npm run migration:show
```

## Rolling back

First find out whether the release being undone added a migration:
`git diff --stat <previous tag> <current tag> -- backend/src/database/migrations`.

**No migration.** In Render, open the service → *Events* → the previous deploy →
*Rollback*. Or revert the commit on `main` and push, which leaves a trace in the
history. Do the front end too if it changed.

**With a migration that only added things** (new tables, new nullable columns,
new indexes): the previous code does not use them, so roll back as above and leave
the schema as it is. Undo the migration later, in a normal release, if it has to go.

**With a migration that changed or removed something** the previous code relies on:

1. Check out the release being undone, which still has the migration's `down()`.
2. Undo it against production, one migration per run:

   ```bash
   cd backend && npm ci
   DATABASE_URL='<production URL>' npm run migration:revert
   ```

   Repeat once per migration of the release, and check with `migration:show`.
3. Roll the services back as above.

Never roll the API back before reverting such a migration: the old code would
run against a schema it does not know.

## Restoring the database

Neon keeps a history of the database and can restore it to a point in time, within
the window that the plan keeps. On the free plan that window is **six hours**
(September 2026): damage noticed the next morning can no longer be undone from Neon,
and the weekly copy below is what is left. **That copy is not set up yet: until it is,
nothing older than six hours can be recovered.**

From Neon's history, within those six hours:

1. In Neon, create a branch from the main branch at a moment before the damage
   (*Branches → Create branch → Past point in time*).
2. Connect to that branch and check the data is what it should be.
3. Either restore the main branch to that point (*Restore*), which keeps the
   connection string, or point `DATABASE_URL` in Render at the new branch and
   redeploy the API.
4. Write down what was lost between the restore point and the incident: bookings,
   payments and messages created in between are gone from the database, but
   payments still exist in Stripe.

### Weekly copy

Every Monday at 03:41 UTC, `.github/workflows/copia-base.yml` dumps the database with
`pg_dump` and keeps it for 90 days as a workflow artifact named `copia-YYYY-MM-DD`.
The plain dump only ever exists in the runner's memory: it is encrypted with
[age](https://age-encryption.org) before it is written anywhere, because this repository
is public and anyone signed in to GitHub can download a workflow's artifacts. Only the
public key is in GitHub.

**It is not set up yet, and until it is the run fails**, so that GitHub emails about it
every Monday. It used to end in green after ten seconds without copying anything, which
read as a weekly copy that did not exist. It needs:

1. A key pair, kept outside GitHub: `age-keygen -o servilocal-copias.txt`. The file
   holds the private key; store it in a password manager. The line starting with
   `# public key:` is the public one.
2. In GitHub, *Settings → Secrets and variables → Actions*: the variable
   `COPIA_CLAVE_AGE` with the public key (`age1…`), and the secret
   `COPIA_DATABASE_URL` with a connection string to Neon. Better with a role that can
   only read: in Neon's SQL editor, `CREATE ROLE copias WITH LOGIN PASSWORD '…';
   GRANT pg_read_all_data TO copias;`.
3. Run it once by hand (*Actions → Copia semanal de la base → Run workflow*) and check
   that the artifact appears.

To restore one, into a **new, empty database**. Not into a Neon branch: a branch starts
as a copy of its parent, tables included, so `pg_restore` fails on everything that
already exists and leaves a mixture of the two. Create the database with
`CREATE DATABASE servilocal_restaurada;` from Neon's SQL editor, and take the usual
connection string with that name in place of the old one. Use the owner's role, not the
read-only one the copies are taken with.

```bash
gh run download <run id> -n copia-2026-10-05
age --decrypt --identity servilocal-copias.txt copia-2026-10-05.dump.age \
  | pg_restore --no-owner --no-privileges --dbname='<URL of the empty database>'
```

`pg_restore` has to end without a single error; if it reports any, read them before
going on. Then check the data, point `DATABASE_URL` in Render at that database and
redeploy the API. The copy carries the `migrations` table, so the API applies only the
migrations added after it was taken. Everything created after the copy is gone;
payments still exist in Stripe.

These steps run on every push, in CI's integration job
([`scripts/ensayo-restauracion.sh`](../scripts/ensayo-restauracion.sh)): the seeded
database is copied and encrypted by the script the weekly copy uses, restored into an
empty one, and the two are compared, every table's rows and the extensions,
constraints, indexes and sequences. What that cannot rehearse is Neon itself: creating
the database there and restoring into it over the network has never been done.
**Do it once**, before it is needed.

## Seeding

`npm run seed` deletes every row and inserts the demo data. The demo ages: its pending
requests are dated a week ahead, and once their date passes the hourly job expires them,
so the provider inbox runs out of requests to accept until the next seed. It refuses any host
that is not local unless `SEMILLA_CONFIRMAR` carries the name of the database
being emptied, so a production URL left in `.env` cannot wipe production by
accident.

The seed also saves the copy of the demo that the API restores every hour, in
`demostracion_original`. What the demo accounts change in services, profiles and
reviews goes back to what the last seed left once it has been untouched for an hour,
and what they publish is deleted, or withdrawn if it already has bookings. So:

- To change what the demo shows, change the seed and run it. An edit made straight in
  the database is undone within the hour.
- In production, where the seed is not run, the copy was taken by the migration that
  created the table.
- Each pass that changes something logs `Demostración restaurada: …` with the counts.
- `RESTAURAR_DEMOSTRACION=false` turns the job off, for instance on a local copy you
  want to edit by hand.

## Watching production

- **Health**: `GET https://servilocal-api.onrender.com/api/health` checks the
  database and answers 503 when it does not respond. `/api/health/vivo` only says
  that the process answers, and is the one Render's own health check calls.
- **Keep-awake ping**: from 08:00 to 15:59 UTC, a run every five minutes. Each one
  is a short round of requests and nothing else. The first of every hour calls the
  home page and `/api/health`, which queries the database; the rest call `/salud`
  and `/api/health/vivo`, which do not, so Neon can still suspend. A run fails, so
  GitHub emails whoever last changed the workflow, when an address does not answer
  200 after a retry. Runs never overlap, and one that GitHub starts outside the
  window calls nothing. Nothing watches outside those hours.

  **It cannot be relied on.** GitHub starts scheduled runs late or skips them. On
  29 September 2026 only 23 of the 77 runs expected in a morning started, and to
  cover the gaps each run was made to stay for 45 minutes, calling in a loop. The
  next day those runs, overlapping in twos and fours, added up to 18 hours of
  machine time, and from 1 October GitHub started two or three a day, some of them
  outside the window altogether: the demo slept most of the time. Nothing proves
  that one caused the other, but a waiting loop is not what Actions are for, so the
  workflow went back to one short round per run, one at a time. What keeps the demo
  awake is the external monitor below; the workflow is a second line, and the
  failure emails.
- **Vulnerabilities**: `npm audit` over production dependencies on every push and
  every Monday at 06:17 UTC (`vulnerabilidades.yml`). A new advisory, or an accepted
  one past its date in `auditoria-aceptada.json`, fails the run.
- **Smoke test**: after every deploy of `main`; opens an issue when it fails.
- **Request log**: one JSON line per request in the API's log in Render, with
  method, path (no query string), status, milliseconds and the request id. Anyone
  reporting an error screen can read out its reference code, which is that id:
  search the log for it. A request the client gave up on is logged too, with
  `"abortada":true` and no status if nothing was sent: the slow ones are exactly
  those.
- **Shutdown**: the API logs the signal it received (`SIGTERM: se cierran…`) and,
  last, the code it exits with (`Proceso terminado con código 0`). An exit with 1
  between those two lines failed while closing; without the first line it was not a
  shutdown. Redis gets three seconds to acknowledge its `QUIT`, then the connection
  is cut.
- **Instances**: every time a service wakes up, Render gives it a new instance id.
  Search the log by service, not by instance, or a search from before the last
  wake-up comes back empty. Going to sleep leaves no event in Render's event list,
  even when the process exits with an error on the way down; a crash while
  serving shows up there as a failure.
- **Errors**: Sentry, once `SENTRY_DSN` is set.

### External monitor

**Not set up yet**, and until it is the demo sleeps whenever GitHub skips the ping.

A free monitor such as [cron-job.org](https://cron-job.org) or
[UptimeRobot](https://uptimerobot.com) calls on time, which GitHub's scheduler does not.
Set up two checks, every 10 minutes, Monday to Friday from 08:00 to 16:00 UTC:

- `https://servilocal-web.onrender.com/salud`
- `https://servilocal-api.onrender.com/api/health/vivo`

Neither touches the database, so Neon still suspends. Expect a 200 and a body with
`"estado":"ok"`, and send failures to email. Weekdays only, both services cost about
360 of the 750 free hours a month; every day, about 510. Watching outside those hours
wakes the services too, so it spends the same quota.

### If a service does not wake up

Symptoms: it answers `503` with `Retry-After` for minutes, nothing new appears in its
log and its event list is empty. On 5 October 2026 the front end stayed like that from
about 08:00 to 08:43 UTC, with the API awake and Render reporting no incident.

1. Confirm it from outside your network, and check
   [Render's status page](https://status.render.com).
2. Redeploy the same commit: in Render, the service → *Manual Deploy* → *Deploy latest
   commit*. Nothing changes but the instance.
3. Check `/salud` or `/api/health` until it answers with the expected `version`.

## Rotating secrets

| Secret | Where | Effect of rotating it |
|---|---|---|
| `JWT_SECRET` | API | Every session ends; everyone signs in again |
| `PROXY_SECRETO` | API and front end, same value | Change both at once, or the API stops trusting the visitor address the front end relays |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | API | Roll the key in Stripe first; the webhook secret belongs to the endpoint registered there |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Front end, at build time | Needs *Clear build cache & deploy* |
| Neon password | `DATABASE_URL` in the API | Reset it in Neon, update the variable, redeploy |
| `ANTHROPIC_API_KEY`, `BREVO_API_KEY`, `SENTRY_DSN` | API | None beyond the feature itself |

## Free-plan limits

- **Render**: 750 hours a month for the whole workspace, which has four services.
  The keep-awake window costs about 510 of them. When the quota runs out, Render
  suspends every free service until the next month.
- **Neon** (free plan, September 2026): 100 CU-hours of compute a month per project,
  0.5 GB of storage and six hours of history. Compute suspends after five idle
  minutes, and the next query waits for it to resume. The keep-awake ping touches
  the database once an hour, so compute suspends in between; the hourly jobs and
  real visits wake it too. Even awake the whole window, at the
  minimum size of 0.25 CU, it would be about 64 CU-hours a month; if autoscaling lets
  it grow, that multiplies. When the hours run out, Neon suspends the database until
  the next month. Check *Usage* in the Neon console once a week, as well as Render's.
- **GitHub**: scheduled workflows stop after 60 days without activity in the
  repository, and scheduled runs are sometimes late or skipped.
