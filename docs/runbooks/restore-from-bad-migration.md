# Runbook: Restore BSK schema after a bad migration

Scope: a migration applied to the shared Supabase project broke `bsk.*` data or structure. Goal: recover BSK without touching sibling schemas.

## Constraints (read first)

- Supabase free-tier PITR is **project-wide**: restoring rewinds every schema, not just `bsk`. Do not use PITR unless the sibling apps consent.
- The only safe per-app recovery path is restoring from a `pg_dump --schema=bsk` snapshot.
- If no recent dump exists, escalate: weigh BSK damage against sibling apps' tolerance for PITR.

## Prerequisites

- `psql`, `pg_dump`, `pg_restore` installed locally.
- Direct connection string to the Supabase project (Settings → Database → Connection string → URI).
- A recent `bsk-YYYYMMDD.sql` dump (daily cron, see "Cron setup" below).

## Procedure

### 0. Triage

```bash
psql "$SUPABASE_DB_URL" -c "SET search_path TO bsk; \d"
# Confirm the damage scope before touching anything.
```

### 1. Quiesce BSK writes

- Vercel: set the BSK project to maintenance mode (turn off prod deployment or flip a maintenance flag).
- Pause any QStash topics targeting BSK routes.

### 2. Drop and recreate the BSK schema

```bash
psql "$SUPABASE_DB_URL" <<'SQL'
DROP SCHEMA IF EXISTS bsk CASCADE;
CREATE SCHEMA bsk AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA bsk TO anon, authenticated, service_role;
SQL
```

This affects **only** the `bsk` schema; sibling schemas (e.g. `blog`, `links`) are untouched.

### 3. Restore from the latest dump

```bash
psql "$SUPABASE_DB_URL" -f bsk-YYYYMMDD.sql
```

### 4. Re-apply migrations newer than the dump (if any)

```bash
supabase db push  # pushes only migrations after the snapshot
```

Confirm `supabase_migrations.schema_migrations` matches expectations.

### 5. Verify

```bash
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM bsk.app_users;"
# Spot-check row counts vs pre-incident metrics.
```

### 6. Re-open BSK

- Vercel: deployment back to prod.
- QStash: un-pause topics.

### 7. Postmortem

- Record the incident date + dump used in `docs/incidents/`.
- If the bad migration came from this repo, revert the migration file and open a regression test.

## Cron setup (one-time)

Add a daily `pg_dump --schema=bsk` to wherever you want backups stored (GitHub Actions cron on a private repo, a personal NAS, or an S3 bucket). Example GitHub Actions:

```yaml
# .github/workflows/bsk-daily-dump.yml — illustrative
on:
  schedule: [{ cron: "0 18 * * *" }] # 18:00 UTC = 01:00 ICT
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - run: pg_dump --schema=bsk "$SUPABASE_DB_URL" > "bsk-$(date -u +%Y%m%d).sql"
      # upload to a private store (artifact / S3 / personal repo)
```

Keep 30 daily + 12 monthly snapshots. Free-tier Supabase storage caps quickly, so push dumps off-platform.

## When to escalate to project-wide PITR

Only when:

- BSK data loss is severe and recent enough that sibling apps haven't accumulated important new state, AND
- Every sibling app's owner agrees, AND
- The point-in-time target is < 24h ago (Supabase free-tier PITR window).

Otherwise: accept the data loss between dump and incident, restore from dump.
