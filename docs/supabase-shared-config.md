# Supabase Shared-Project Config

The BSK Supabase project is shared with several other personal side projects. Settings outside the per-app `bsk.*` schema are **project-wide** — changing them affects every app on the same project. This doc records what is currently configured and who owns it, so future changes don't blindside neighboring apps.

Update this file whenever a project-wide setting changes.

## Project metadata

| Field | Value |
|---|---|
| Project ref | _(fill in: e.g. `abcdefghijklmnopqrst`)_ |
| Region | _(fill in: e.g. `ap-southeast-1`)_ |
| Plan | Free (Hobby) |
| Primary owner | tiennm99 |
| Apps sharing this project | bsk, _(future: blog, links, …)_ |

## Per-app schemas

| Schema | App | Repo | Status |
|---|---|---|---|
| `bsk` | BSK clinic rewrite | this repo | active |
| `public` | (reserved — do not use) | — | — |

Rule: no app may write to `public`. Every table, view, function, type, policy must be schema-qualified.

## Project-wide settings (change with caution)

These are **single-value-for-the-whole-project** settings. Any change is announced in this doc + a commit message before the change lands.

### Auth providers

- Email/password: enabled
- Magic link: _(record decision)_
- OAuth: _(none yet — record provider, client id source when added)_
- Anonymous sign-ins: disabled

### JWT

- Signing algorithm: HS256 (Supabase default)
- Expiry: 3600s (Supabase default)
- Custom claims: _(none)_

### Email templates

- Confirmation, recovery, magic link, invite: Supabase defaults.
- Sender address: Supabase default (`noreply@mail.app.supabase.io`).
- BSK-specific templates: not yet customized. If customized, every app receives the same look.

### SMTP

- Provider: Supabase built-in (rate-limited).
- Custom SMTP: not configured.

### Password rules

- Minimum length: 8 (Supabase default)
- HIBP check: _(record decision)_

### API keys (new format)

- `sb_publishable_*` — browser, replaces anon key.
- `sb_secret_*` — server, replaces service role key.
- Legacy `supabase_key_*` retires 2026-12-31. Not in use.
- Rotation cadence: quarterly, or immediately on suspected leak.
- Storage location: Vercel project env vars, Production-scoped. Never in repo.

## Exposed schemas

PostgREST schema list (Supabase → Settings → API → Exposed schemas): `bsk`, _(others as added)_.

## Storage buckets

| Bucket | Owner app | Public? | RLS notes |
|---|---|---|---|
| `bsk-checkup-media` | bsk | no | per-checkup RLS on object metadata |
| `bsk-public-assets` | bsk | no | signed URLs only |

Bucket names must be prefixed with the owner app slug.

## Realtime channels

Channel names live in a single project-wide namespace. Prefix every channel with the owner app slug:

- `bsk:queue:{shift_id}` ✓
- `queue:{shift_id}` ✗ (would collide with any sibling using the same name)

## Change-coordination protocol

1. Update this file with the proposed change + which apps it affects.
2. Open a draft PR for visibility (even if no sibling app shares this repo).
3. After applying the change in the Supabase dashboard, commit the doc update referencing the dashboard change.
4. For destructive changes (auth provider removal, JWT rotation, schema drop): pause sibling apps' deploys first.

## Forbidden operations

- `supabase db reset` against this project — wipes every app's data.
- `supabase db remote commit` from any one app without verifying it includes only that app's schema.
- `KEYS *`, `FLUSHDB`, `FLUSHALL` against the shared Upstash DB (separate concern; see `lib/upstash.ts`).
- Manual edits to `auth.*` or `storage.*` tables outside the dashboard.

## Backup & restore

Free-tier PITR is project-wide; a restore wipes every app's data to a point in time. Per-app rollback is not supported by Supabase. Mitigations:

- Daily `pg_dump --schema=bsk` cron (see `docs/runbooks/restore-from-bad-migration.md`).
- Preflight check on migrations (see `scripts/preflight-supabase.ts`).
- Never run destructive DDL without a recent dump.
