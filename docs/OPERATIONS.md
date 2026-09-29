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
| CI, smoke test, keep-awake ping | GitHub Actions | See `.github/workflows/` |
| Payments | Stripe, test mode | Webhook at `/api/payments/webhook` |
| Email | Brevo | Password recovery only; without a key, recovery answers 503 |
| Errors | Sentry, optional | Off without `SENTRY_DSN` |

The Render side is described in [`render.yaml`](../render.yaml). It only takes
effect once it is linked in Render as a Blueprint (*New → Blueprint*, pick this
repository, and accept the existing services). Two of its settings are not what
the dashboard has today, and both matter:

- **`autoDeployTrigger: checksPass`**: deploy once CI is green, not on every push.
  Today a push to `main` deploys straight away, migrations included, before CI has
  finished.
- **`healthCheckPath`**: `/api/health` and `/salud`. Without one, Render treats a
  deploy as live as soon as the port opens.

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
only warns: a `JWT_SECRET` under 32 characters, and a missing `PROXY_SECRETO`.

## Migrations

They run when the API boots, all pending ones in a single transaction: if one fails,
none is applied and the API does not start, which leaves the previous version
serving.

Rules for writing them:

- **Every migration has a working `down()`**, and the integration suite runs the
  whole chain from an empty database on every push.
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
the window that the plan keeps. **Confirm that window in the Neon console
(*Settings → Storage*) and rehearse a restore once**, before it is needed.

1. In Neon, create a branch from the main branch at a moment before the damage
   (*Branches → Create branch → Past point in time*).
2. Connect to that branch and check the data is what it should be.
3. Either restore the main branch to that point (*Restore*), which keeps the
   connection string, or point `DATABASE_URL` in Render at the new branch and
   redeploy the API.
4. Write down what was lost between the restore point and the incident: bookings,
   payments and messages created in between are gone from the database, but
   payments still exist in Stripe.

There are no dumps of our own. If they are ever added, encrypt them before they
leave the runner: this repository is public, and anyone signed in to GitHub can
download a workflow's artifacts.

## Seeding

`npm run seed` deletes every row and inserts the demo data. It refuses any host
that is not local unless `SEMILLA_CONFIRMAR` carries the name of the database
being emptied, so a production URL left in `.env` cannot wipe production by
accident.

## Watching production

- **Health**: `GET https://servilocal-api.onrender.com/api/health` checks the
  database and answers 503 when it does not respond.
- **Keep-awake ping**: every five minutes from 08:00 to 15:55 UTC, both services.
  It fails, and GitHub emails whoever last changed the workflow, when either does
  not answer 200 after a retry. Nothing watches outside those hours.
- **Smoke test**: after every deploy of `main`; opens an issue when it fails.
- **Request log**: one JSON line per request in the API's log in Render, with
  method, path (no query string), status, milliseconds and the request id. Anyone
  reporting an error screen can read out its reference code, which is that id:
  search the log for it.
- **Errors**: Sentry, once `SENTRY_DSN` is set.

An external monitor outside working hours is worth having, but it wakes the
service: checking only the API every three hours costs about 40 of the 750 free
hours a month; checking both services every hour would use up the quota.

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
  The keep-awake window costs about 505 of them. When the quota runs out, Render
  suspends every free service until the next month.
- **Neon**: compute suspends after five idle minutes; the next query waits for it
  to resume.
- **GitHub**: scheduled workflows stop after 60 days without activity in the
  repository, and scheduled runs are sometimes late or skipped.
