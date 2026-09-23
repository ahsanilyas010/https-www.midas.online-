# ABPO Command — Operations Runbook

Phase 8 deliverable per the build spec. This is the "what do I actually do"
document for running this system day to day — setup and architecture live
in `README.md`; this is incidents, routine operational tasks, and
escalation.

## 1. Who to call

There is one environment and one operator (Ahsan Ilyas) at the time of
writing. There is no on-call rotation yet — add one before this goes live
with real campaigns and real agents depending on it. Until then, this
document is written for "future Ahsan at 2am," not a team.

## 2. Where things live

- **App**: Next.js on Vercel (or wherever it's deployed — not yet chosen).
- **Database**: Supabase project "ABPO Command",
  `project_id uvgekzergvtbvvhvuyyh`, region `us-east-1`, free tier.
- **Backups**: `.github/workflows/nightly-backup.yml`, 02:00 PKT daily —
  see section 6 below. **Not yet live**: it needs six repo secrets that
  aren't configured (see the workflow file's header comment).
- **CI**: `.github/workflows/ci.yml`.
- **Email**: Resend, via `src/lib/email/provider.ts`.

## 3. Incident response

### The app is down / returning 500s everywhere

1. Check Vercel's (or your host's) status/deploy log first — a bad deploy
   is the most common cause and `vercel rollback` (or your host's
   equivalent) is faster than debugging live.
2. Check Supabase project status at `https://supabase.com/dashboard/project/uvgekzergvtbvvhvuyyh`
   — the free tier pauses a project after a week of inactivity, and it
   needs a manual "restore" click to come back. This is a real, known trap
   — see README's "Cost reality" section.
3. Check `get_logs` (Supabase MCP) or the dashboard's Logs tab for
   Postgres-side errors (connection exhaustion, a bad migration, RLS
   misconfiguration).

### Agents can't dial / the workspace queue is empty for everyone

1. Check `v_dialable_leads` directly with a manager-role query — if it's
   empty but `leads` has rows, the join against `suppression_list` or the
   screening-status filter is the likely cause. Re-read the "RLS
   recursion and suppression-visibility" postmortem in the README before
   changing suppression RLS — that exact class of bug has bitten this
   codebase once already, in a way invisible to superuser testing.
2. Check `pg_cron` jobs are actually running: `select * from cron.job;`
   and `select * from cron.job_run_details order by start_time desc limit
   20;`. A silently-failed `sweep-followups` or `sweep-screening-expiry`
   job won't crash anything, it just goes stale.

### A calling-window or attempt-cap breach shows non-zero on the compliance console

This should never happen — `/admin/compliance`'s calling-window monitor
and `v_dialable_leads`'s attempt-cap filter are supposed to make it
structurally impossible. Treat a non-zero reading as a real incident, not
a display bug:

1. Pull the offending `call_attempts` rows and find the common thread
   (specific agent, specific campaign, specific timezone).
2. Check whether `leads.lead_timezone` is null or wrong for those rows —
   `within_call_window` is computed against it, so a missing timezone at
   import time is the most likely root cause.
3. Freeze the affected campaign (set `campaigns.is_active = false`) while
   investigating if the volume is more than a handful of rows.

### The nightly backup hasn't run / failed

1. Check the Actions tab for `nightly-backup.yml`'s run history.
2. Most likely cause: one of the six required secrets was never set, or
   expired (rotated AWS/Supabase keys). See the workflow file's header for
   the full list.
3. This workflow existing but never having successfully run is a known,
   flagged gap — see README's Backups section. **Verify a real restore
   works (section 6 below) before this system holds any real campaign's
   only copy of lead data.**

## 4. Routine operational tasks

### Bootstrap the first admin account

```bash
npm run bootstrap-admin -- --email you@example.com --name "Your Name"
```

Needs `SUPABASE_SERVICE_ROLE_KEY` set locally. Prints a one-time password;
the account is forced to change it on first login.

### Apply a pending migration

```bash
# via the Supabase CLI, or the apply_migration MCP tool
supabase db push
```

Then regenerate types — **do this every time**, the app will not compile
against a schema `types.ts` doesn't know about:

```bash
supabase gen types typescript --project-id uvgekzergvtbvvhvuyyh > src/lib/supabase/types.ts
```

Migrations 21-25 have been applied to the live database (via the
Supabase dashboard SQL editor, since the Supabase MCP connector used for
this build intermittently rejected `apply_migration`/`execute_sql`).
`types.ts` was hand-extended ahead of application rather than generated —
regenerate it for real the next time a working MCP/CLI connection is
available, as a sanity check against the hand-written version.

### Re-run screening on a campaign

`/admin/compliance` → "Run screening" → pick the campaign. The internal
check (against `suppression_list`) always works and needs no external
account. For a real TPS/CTPS/US DNC bureau result: run the check on the
bureau's own portal, then upload its response file through the same
dialog's "Bureau evidence upload" tab — the file itself becomes the
retained evidence artefact.

### Suppress a number by hand

`/admin/compliance` → "Suppress a number." Takes effect immediately,
globally, permanently — there's no undo UI. To reverse a mistaken
suppression, a `super_admin` deletes the row directly (RLS restricts
`DELETE` on `suppression_list` to `super_admin` for exactly this reason —
it's meant to be rare and deliberate).

### A campaign's screening has gone stale (28-day clock)

`/admin/compliance` shows an "Expired" count once `sweep_screening_expiry()`
(runs hourly via `pg_cron`) has caught up. Leads already stop appearing in
`v_dialable_leads` the moment `screened_at` ages past
`campaigns.screening_max_age_days`, regardless of whether the sweep has
run yet — the compliance gate itself doesn't wait on the display counter.
Re-run screening (above) to clear it.

### Rotate a secret (Resend key, unsubscribe secret, Supabase service key)

1. Generate the new value at the provider.
2. Update it in the hosting platform's environment variables and
   `.env.local` for local dev.
3. Redeploy. `UNSUBSCRIBE_SECRET` rotation invalidates every
   previously-sent unsubscribe link — acceptable, since a suppressed
   recipient stays suppressed regardless (the link is a convenience, not
   the only path to opt out).

## 5. Rate limits

`check_rate_limit()` (migration 24) backs three endpoints. Current
thresholds, tune in the calling code (`src/lib/rate-limit.ts` call sites)
if they're wrong for real traffic:

| Endpoint | Bucket | Limit |
|---|---|---|
| Login | `login` | 10 attempts / 5 min, per IP+email |
| `/api/leads/inbound` | `leads_inbound` | 20 / hour, per IP |
| `/api/unsubscribe` | `unsubscribe` | 30 / hour, per IP |

## 6. Restoring from backup

```bash
# download the .sql.gz.enc object from Supabase Storage (bucket: backups)
# or S3 (s3://$BACKUP_S3_BUCKET/nightly/), then:
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:$BACKUP_ENCRYPTION_KEY \
  -in backup.sql.gz.enc | gunzip | psql "$SCRATCH_DATABASE_URL"
```

Restore into a **scratch/branch database first**, never directly into
production — verify row counts and spot-check a few tables, then decide
whether to promote it. This procedure has not been exercised end-to-end
yet; the spec calls this out explicitly ("verify a real restore before
Phase 2") and it remains an open item.

## 7. Known gaps at the time of writing

- `types.ts` was hand-extended rather than generated for migrations
  21-25 (now applied) — regenerate for real and diff the next time a
  working Supabase MCP/CLI connection is available.
- No monitoring/error-tracking account configured — `src/lib/error-tracking.ts`
  logs structured JSON to stderr only; wiring a real APM provider is a
  documented extension point, not done.
- TPS/CTPS/US National DNC provider integrations are configuration-gated
  stubs pending real bureau accounts (spec section 9) — `ManualEvidenceProvider`
  is the working path until then.
- Backup workflow has never successfully run (missing repo secrets); no
  restore has been tested.
- No load testing has been run against the live database — the spec asks
  for 500k leads / 2M call attempts, which is a lot of storage against a
  free-tier project and was deliberately not run without checking first;
  see the note left for the operator in the project conversation.
- Index review: see `docs/index-review.md` if present, or re-run
  `EXPLAIN ANALYZE` against the key list queries (`v_dialable_leads`,
  `leads` by campaign, `call_attempts` by agent, `followups` due) as data
  volume grows — the current indexes were sized for a fresh project, not
  500k+ rows.
