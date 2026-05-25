# BSK Architecture Red-Team â€” Pre-Phase-1

**Date:** 2026-05-25
**Scope:** PLAN.md Â§2â€“Â§3, Phase 0 scaffold, foundational lib/ code.
**Stance:** No code yet past scaffold. Cheapest moment to challenge. Brutal.

---

## TL;DR

The plan is well-researched and the namespacing discipline is real (`lib/upstash.ts` and `lib/supabase/*` enforce it in code, not just docs). But shared-infra is the dominant systemic risk and the mitigations are partly aspirational. Three concrete gaps must close before Phase 1: (a) raw-import lint guard, (b) the `docs/supabase-shared-config.md` PLAN.md keeps referencing but does not exist, (c) a written restore/rollback drill for the shared project. Everything else is accept-and-document or revisit-at-phase-X.

---

## F1. Shared Supabase project â€” PITR is global, app-level backup is not free-tier

**Plan says:** Â§2.1 + Â§3 acknowledge `supabase db reset` is forbidden and one bad migration affects all schemas. Mitigation: do not run destructive commands; loose timestamp coordination.

**Why risky:**
- Supabase free-tier PITR is 1-day on Pro, **not available on free**. Free tier gives daily logical backups only; restore is full-project, not per-schema. There is no documented "restore only schema bsk" path. If a BSK migration corrupts a join, the operator restores the whole project (every app, including any sibling with same-day writes) or hand-extracts BSK from a `pg_dump`.
- "Do not run `supabase db reset`" is not a control; it is an honor system. A future contributor or AI agent CAN run it.

**Recommendation (mitigate now):**
1. Add `scripts/preflight-supabase.ts` invoked by `pnpm db:push` that refuses to run if `--linked` project ref does not match an allow-listed `BSK_SUPABASE_PROJECT_REF` env var. Cheap, real safety net.
2. Write `docs/runbooks/restore-from-bad-migration.md` with the actual command sequence (`pg_dump --schema-only`, drop+recreate `bsk`, replay migrations to N-1). Thirty lines is enough â€” the discipline is having tried it once.
3. Schedule one `pg_dump --schema=bsk` per day into Supabase Storage (or personal S3) via Vercel Cron. Free at clinic scale; gives a true app-level snapshot independent of project-wide PITR.

**Confidence:** high.

---

## F2. `docs/supabase-shared-config.md` referenced, does not exist

**Plan says:** Â§2.2 â€” "Coordinate before tweaking; document the current configuration in `docs/supabase-shared-config.md`." PLAN.md treats this as the entire coordination mechanism for project-wide Auth / SMTP / JWT settings.

**Why risky:** Load-bearing document that does not exist. The moment a second app needs OAuth or a different email template, there is nowhere to look and no record of current state. SMTP changes affect password reset for every app silently.

**Recommendation (must-fix-before-Phase-1):** Create `docs/supabase-shared-config.md` now, even as a 40-line skeleton:
- Project ref + dashboard URL
- Email provider in use (default Supabase / custom SMTP)
- Email template diffs from default (Vietnamese? English?)
- OAuth providers enabled (none, initially)
- JWT expiry, refresh window
- Site URL + redirect allow-list (this WILL collide between apps)
- Password policy (length, breached-password check)
- "Apps consuming this project: bsk (this repo). Future: ___."

Single most leveraged 1-hour task on the backlog.

**Confidence:** high.


---

## F3. Raw-import escape hatch â€” namespacing enforced by convention, not lint

**Plan says:** Â§2.4 forbids raw `@upstash/redis` use; `lib/upstash.ts` gates everything through prefixed helpers. Same for Supabase clients.

**Why risky:** Nothing stops a new file from importing `Redis` from `@upstash/redis` directly. Prefix discipline is cultural; one bypass plus a careless `KEYS *` touches every other app's keys. Same for `createClient` from `@supabase/supabase-js` ignoring schema binding.

**Recommendation (must-fix-before-Phase-1):** ESLint `no-restricted-imports` to ban:
- `@upstash/redis` and `@upstash/ratelimit` outside `lib/upstash.ts`
- `@supabase/supabase-js` outside `lib/supabase/admin.ts`
- `@supabase/ssr` outside `lib/supabase/{server,client,session}.ts`

About ten lines of config. Zero runtime cost. Catches the failure mode in PR review automatically.

**Confidence:** high.

---

## F4. Shared `auth.users` SSO â€” the threat is sign-up, not sign-in

**Plan says:** Â§2.2 frames cross-app SSO as a feature; `bsk.app_users` gates authorization.

**Why risky:**
- If any sibling app (blog, links, etc) enables **public sign-up**, every email signing up there ALSO exists in BSK's `auth.users`. They can hit BSK sign-in; the gate is then a `bsk.app_users` lookup â†’ 403. Functionally fine, BUT every sibling app's sign-up form now leaks "is this email registered in any of your apps?" â€” enumeration vector you do not own.
- Password reset flows are project-wide. A reset email triggered from sibling A with default templates uses whatever `redirectTo` says, but sender domain is unified. Phishing surface unifies.
- A leaked `sb_secret_*` from any sibling app bypasses RLS on the `bsk` schema entirely. Blast radius of a leak is the whole project, not the leaking app.

**Recommendation:**
- Accept-and-document for the user's stated preference. Add to `docs/threat-model.md` (also does not exist â€” create):
  - "Any sibling app with open sign-up is an enumeration oracle for BSK users."
  - "`sb_secret_*` rotation must be coordinated across all consuming apps simultaneously."
  - **Policy:** sibling apps sharing this Supabase project must use invite-only sign-up, OR BSK accepts the enumeration risk knowingly.
- Runtime guard in BSK sign-in: if `auth.users` row exists but `bsk.app_users` does not, return generic "credentials invalid" (not "not enrolled"). Already implied; document as a security requirement, not a UX choice.

**Confidence:** high.

---

## F5. QStash shared signing key â€” receiver-side validation is the only boundary

**Plan says:** Â§2.4 â€” QStash signing keys are shared; each app's `/api/qstash/*` route verifies via Receiver.

**Why risky:** Signing key proves "this came from QStash," not "this was destined for app X." Any consumer of the shared QStash token can `publish` a message to BSK's `/api/qstash/bsk-recheckup-reminders` URL with a valid signature. Receiver-side verification passes. Authorization is then whatever logic the route handler runs.

**Recommendation (mitigate at Phase 7, acknowledge now):**
- Handler must validate **payload schema** with Zod and **business invariant** (e.g., `checkup_id` exists in `bsk.checkups`). Signature alone is not authorization.
- Document in `lib/upstash.ts` next to `getQStashReceiver`: "Signature proves origin, not intent. Always re-validate payload against schema + DB state in the route handler."
- Add to threat model: "QStash signing key compromise = any app can fire jobs into any other app's QStash routes. Treat route handlers as zero-trust."

**Confidence:** med (real risk; Phase 7-deferred; mitigations well-known).


---

## F6. `redisKeyPrefix` derives from `NEXT_PUBLIC_APP_ENV`, not `VERCEL_ENV`

**Plan says:** Â§2.4 â€” distinct keyspaces per env via `bsk:{env}:`.

**Why risky:** `lib/env/server.ts:34` builds `redisKeyPrefix` from `clientEnv.NEXT_PUBLIC_APP_ENV`, defaulting to `"dev"` (`lib/env/client.ts:4`). If a deployment forgets to set `NEXT_PUBLIC_APP_ENV=prod` in Vercel Production, **prod writes land in the `bsk:dev:` keyspace silently** â€” no error, just wrong namespace. Previewâ†’prod promotion forgets one env var â†’ cache poisoning across environments, rate-limits not isolated.

**Recommendation (must-fix-before-Phase-1):** Cross-check at boot. Pseudocode:

    if VERCEL_ENV == "production" and NEXT_PUBLIC_APP_ENV != "prod":
        throw "NEXT_PUBLIC_APP_ENV must be prod on Vercel production"
    # and similarly for preview -> preview

Or auto-derive from `VERCEL_ENV` when present and use `NEXT_PUBLIC_APP_ENV` only as local-dev fallback. Either way, eliminate the silent-default failure mode.

**Confidence:** high.

---

## F7. Phase 5 (Imaging) on 1 GB shared storage â€” costs will dominate, bucket is shared

**Plan says:** Â§4 Phase 5 + Â§7 â€” client-side compression, â‰¤24h signed URLs, nightly retention sweep. "Non-negotiable, not nice-to-haves."

**Why risky:**
- 1 GB Supabase Storage is shared across all apps in the project, not 1 GB per schema. If any sibling app stores non-trivial blobs, BSK Phase 5 hits the ceiling faster than expected.
- "Retention sweep" assumes someone defines a retention window. PLAN does not pick a number. Without a number no sweep is implemented; without a sweep, free-tier exhaustion is weeks, not months.
- Browser `getUserMedia` PNGs are 1-3 MB. 50 checkups/day Ã— 4 images = ~400-1200 MB/day uncompressed. Compression to ~200 KB JPEG is the only thing standing between Phase 5 and a hard stop.

**Recommendation (revisit-at-Phase-5; decide now):**
1. Pin retention to a concrete number in PLAN.md today (suggest: 30 days for educational; document longer for production-leaning fork).
2. Pin compression target today (suggest: max 1600px long edge, JPEG q=0.75, â‰¤300KB target).
3. Consider deferring Phase 5 to AFTER Phase 6 and 7, treating it as stretch. None of the core workflows (queue, checkup, prescription, billing) depend on imaging â€” the original even uses external Google Drive precisely because imaging is heavyweight. Phase 5 as the cost-dominator on shared infra invites the very "this hurts other apps" outcome Â§3 warns about.
4. Alternative: store image metadata in `bsk.checkup_media`, store files in Cloudinary's free 25-credit tier behind a private upload preset. Keeps BSK storage usage near zero. PLAN hints at this; promote from "optional path for clinics" to "default for educational"; Supabase Storage becomes fallback.

**Confidence:** high on cost math; med on store swap (user choice).

---

## F8. Plan gaps a senior reviewer would flag (meta-finding)

**Plan does not have:**

1. **Observability story.** No Sentry, no OpenTelemetry, no structured logging conventions. Vercel logs are 1-day retention on Hobby. When something breaks in Phase 3 Realtime, no signal beyond "user says it is broken." Decide now: Vercel logs only (cheap, lossy) vs Sentry free tier (5k events/mo). Recommend Sentry from Phase 0 with `NEXT_PUBLIC_APP_ENV` as environment tag.
2. **Threat model.** No `docs/threat-model.md`. F4 + F5 + F1 should land there. About one hour, high leverage.
3. **Migration rollback drill.** No documented procedure. F1.2 above.
4. **Secrets rotation.** `.env.example` lists keys; nothing says how/when to rotate `SUPABASE_SECRET_KEY` or QStash signing keys. Recommend `docs/runbooks/secret-rotation.md` listing all secrets + rotation cadence (annually personal; quarterly with real users).
5. **Definition of "done" for educational scope.** Phases 0-8 listed; no stopping condition. Risk: scope creeps to "original 25 features" by Phase 12. Recommend one-line definition in README â€” e.g., "BSK is feature-complete when a receptionistâ†’doctorâ†’cashier flow runs end-to-end on synthetic data with Realtime queue."
6. **Realtime concurrency budget.** PLAN.md Â§7 handwaves "<50 clients." Supabase free is 200 concurrent connections project-wide. With siblings sharing, BSK's actual budget might be ~50. Acknowledge in `docs/supabase-shared-config.md`.


---

## On the 2026 stack bet (sober summary)

| Concern | Verdict |
|---|---|
| Next.js 16 + React 19 async params | Mature enough. Codemod exists. ESLint catches misses. Low risk. |
| `'use cache'` directive | Newer, sharper edges. CONTRIBUTING.md Â§2 documents the trap correctly. Will bite anyone who forgets â€” expect 2-3 PR review catches. Acceptable. |
| Tailwind v4 + shadcn v4 | Stable since late 2024. Low risk. CSS-first `@theme` well-trodden by mid-2026. |
| `@supabase/ssr` async cookies | Verified shape in `lib/supabase/server.ts`. Looks right. Low risk. |
| next-intl v4 + Next 16 | Active `proxy.ts` uses `createMiddleware`; session refresh NOT yet wired (`session.ts` comment confirms). When wired, ordering (refresh-then-intl) and cookie merge are known footgun. Phase 1 hazard, not Phase 0. |
| Zod v4 | Mature. `z.url()` in `lib/env/*` is v4 shape. Fine. |
| Turbopack default | Default since Next 16 stable. Fine. |

**The thing that WILL break:** the `proxy.ts` rename. next-intl's own docs and codegen still emit `middleware.ts` examples. Future-you will see a build warning, search the internet, find stale docs. Pin a comment in `proxy.ts` noting "Next.js 16 renamed `middleware.ts` to `proxy.ts`; export shape identical."

---

## Must-fix-before-Phase-1

1. **F2** â€” Create `docs/supabase-shared-config.md` skeleton.
2. **F3** â€” ESLint `no-restricted-imports` for `@upstash/*` and `@supabase/*` outside `lib/`.
3. **F6** â€” Env-var consistency check (`VERCEL_ENV` â†” `NEXT_PUBLIC_APP_ENV`) at boot.
4. **F1.1** â€” `scripts/preflight-supabase.ts` allow-listing project ref before `db push`.
5. **F1.2** â€” `docs/runbooks/restore-from-bad-migration.md` (even 30 lines).
6. **F7.1 + F7.2** â€” Pin retention window + compression target in PLAN.md.

Everything else is later.

## Accept-and-document (user already chose; just document)

- **F1 (project-wide PITR blast radius)** â€” user chose shared infra. Document trade-off in `docs/supabase-shared-config.md`.
- **F4 (shared `auth.users` SSO)** â€” user chose this; document threat model in `docs/threat-model.md`, add invite-only sibling-app policy.
- **F5 (QStash shared signing key)** â€” design constraint of shared QStash; document in `lib/upstash.ts` JSDoc + threat model.
- **Phase 5 imaging cost** â€” if user wants Supabase Storage anyway, pin retention/compression and accept the cost ceiling.

## Where PLAN.md is hand-wavy

1. Â§2.6 "Coordinate timestamps loosely" â€” what does loosely mean? Pick a rule: filename = UTC at-author-time, no backdating. Done.
2. Â§3 "Revisit if the project ever sees real patient data" â€” no defined revisit trigger. Add: if Vercel analytics shows >1 distinct user/week, revisit.
3. Â§7 "Real-time scale, do not over-engineer" â€” fine as advice, but the actual concurrency cap (Supabase free 200 conns project-wide) is unspoken.
4. Â§4 Phase 5 "configured retention window" â€” configured where? Pin the value.
5. Â§2.2 references `docs/supabase-shared-config.md`; file does not exist. F2.

## Unresolved questions

- Will any sibling app ever have public sign-up? (determines F4 severity)
- User tolerance for adding Sentry now vs at first incident? (determines observability path)
- Is Phase 5 imaging actually needed for educational scope, or is "queue + checkup + billing flow" enough to call BSK done?
- Will Phase 7 QStash reminders actually deploy in educational scope, or stay theoretical? (determines F5 urgency)
