# BSK Threat Model

Educational scope. Synthetic data only. No real patient data ever touches this system. HIPAA/GDPR are explicitly out of scope.

This document records the threat model for BSK as it sits on shared personal infrastructure. Decisions are recorded so they survive the conversation that produced them.

## Trust model

| Surface | Trusted | Why |
|---|---|---|
| BSK Next.js app code | Yes | Author-controlled, single repo |
| BSK Supabase schema `bsk.*` | Yes, gated by RLS | All tables RLS-enabled; policies read `bsk.current_role()` |
| Sibling apps' schemas on the shared Supabase project | Yes (operational neighbor) | Cannot read `bsk.*` rows (different schema + RLS) but **share** the project's auth, settings, API keys, and connection pool |
| Sibling apps' code repos | Yes (same author) | All siblings are author-owned personal projects |
| `auth.users` rows created by sibling apps | Conditionally trusted | Existing in `auth.users` grants nothing on its own; BSK access requires a row in `bsk.app_users` (per-app enrollment table) |
| Public internet | Untrusted | Standard |

## Sibling-app policy (load-bearing)

**Siblings sharing this Supabase project MUST NOT expose public signup.** Every sibling app is invite-only. This is the primary mitigation for the shared `auth.users` blast radius.

Reasoning: `auth.users` is single-tenant per Supabase project. A public-signup sibling would let an attacker create an `auth.users` row, then attempt to hit BSK auth endpoints with valid credentials. The per-app enrollment check in `bsk.app_users` would reject them — but only if the enrollment policy is correctly implemented in Phase 1. Defense in depth says don't put us in that position to begin with.

If a sibling app ever needs public signup, BSK must move to its own Supabase project first (see PLAN.md §3).

## Residual risks (accepted, not closed)

These are the consequences of the "shared infrastructure" choice in PLAN.md §3. They are accepted for the educational scope; revisit if BSK ever sees real users.

### R1 — Project-wide blast radius on `sb_secret_*` leak

The Supabase secret key (`sb_secret_*`) is project-wide. A leak from any sibling app exposes every schema in the project, including `bsk.*`. Mitigations:

- Server-only env var; never in `NEXT_PUBLIC_*`. Enforced by `.env.example` shape and the env-validation schema in `lib/env/server.ts`.
- Vercel env scoping: store the production secret as a Production-only variable on each sibling project. Preview/dev use different keys.
- Rotation: TODO — pick a cadence and add to `docs/supabase-shared-config.md`. Rotate immediately on any suspected leak.

### R2 — Project-wide PITR

Free-tier point-in-time restore is project-wide. A bad migration in BSK that requires PITR also rewinds every sibling schema. See `docs/runbooks/restore-from-bad-migration.md` for the per-schema dump/restore path that avoids PITR. Prefer it.

### R3 — Project-wide settings change

Auth providers, JWT, email templates, password rules, and SMTP are single-value-for-the-project. A sibling app changing these affects BSK. Coordination protocol lives in `docs/supabase-shared-config.md`.

### R4 — Connection-pool contention

The Supabase connection pool is shared across schemas. A runaway Server Action in any sibling degrades BSK latency. Mitigation: keep Server Actions short; prefer Edge runtime for hot paths.

### R5 — Realtime channel collision

Channel names are project-wide. BSK channels must be prefixed `bsk:`. Enforced by convention (see `CONTRIBUTING.md` §4) — no in-code guard yet.

### R6 — Storage bucket collision

Bucket names are project-wide. BSK buckets must be prefixed `bsk-`. Enforced by convention.

### R7 — Upstash key collision

Redis keys are shared across apps. BSK keys are prefixed `bsk:{env}:` enforced in code by `lib/upstash.ts` + ESLint `no-restricted-imports` blocking raw `@upstash/redis` imports outside the factory.

### R8 — QStash cross-app spoofing

The QStash signing key is shared across apps on the same Upstash account. A sibling app's compromised key could forge requests to BSK's `/api/qstash/*` routes. Mitigation when QStash routes land: validate Zod payload AND DB invariants (e.g., reject if `checkup_id` is not in `awaiting_recheckup` status), not just the signature.

> Note: PLAN.md §4 Phase 7 lists QStash for the 24h-before-recheckup reminder. Whether to keep QStash, switch to Vercel Cron, or skip the feature entirely is **not yet decided**.

## Out of scope

- Real patient data — synthetic only. Repeated in README and PLAN.md.
- HIPAA / GDPR compliance.
- Multi-tenant clinics — single-clinic deployment only.
- Native printer / USB ultrasound device support.
- DDoS protection beyond Vercel's defaults.
- Insider-threat scenarios (single-author personal project).

## Unresolved

- Rotation cadence for `sb_secret_*` and `sb_publishable_*`.
- Phase 5 imaging cost-control numbers (retention window, compression target).
- Phase 7 reminder mechanism (QStash vs Vercel Cron vs drop).
- Whether to add a CI grep that fails the build if `sb_secret_` appears in any `NEXT_PUBLIC_*` line.
