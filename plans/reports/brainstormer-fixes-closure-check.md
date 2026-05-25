# BSK Phase 0 Fix-Closure Audit

**Date:** 2026-05-25
**Scope:** verify whether the 6 must-fix-before-Phase-1 + 4 code-reviewer findings are actually closed by the applied diff, or merely papered over.
**Method:** read original reports, git diff HEAD, every new file.

---

## Closure Table

| ID | Claim | Closed | Evidence | Residual Risk |
|---|---|---|---|---|
| **F2** shared-config doc | created | **Yes** (structurally) | docs/supabase-shared-config.md:1-108 | Five placeholders still _(fill in)_ - usefulness conditional on user filling them in. |
| **F3** ESLint guard | no-restricted-imports added | **Yes** | eslint.config.mjs:19-40 (rule), :43-47 (override). Covers @upstash/redis, @upstash/ratelimit, @supabase/supabase-js. | Missing @upstash/qstash and @supabase/ssr. Override scope (see new-footguns b). |
| **F6** prod-keyspace silent default | superRefine cross-checks VERCEL_ENV vs APP_ENV | **Yes** | lib/env/server.ts:30-43. On Vercel Prod with APP_ENV unset, clientEnv parses dev (default at lib/env/client.ts:4), server superRefine then throws. | .default(dev) in client.ts is now a misleading hint - see new-footguns c. |
| **F1.1** preflight script | created | **Yes** | scripts/preflight-supabase.ts:1-71. Reads supabase/.temp/project-ref. package.json:13-14 wires db:push correctly for cross-platform pnpm. | ALLOWED_PROJECT_REFS empty - first clone of repo fails db:push (see new-footguns a). |
| **F1.2** restore runbook | created | **Yes** | docs/runbooks/restore-from-bad-migration.md:1-100. DROP SCHEMA bsk CASCADE; CREATE SCHEMA bsk (line 35-36) correctly preserves sibling schemas. pg_dump --schema=bsk syntax correct (line 86). Acknowledges data loss between dump and incident (line 100). | Cron is illustrative-only; no actual workflow committed. |
| **F7.1+F7.2** retention + compression pin | not addressed | **N/A - deliberately deferred** | git diff HEAD shows zero changes to PLAN.md. User explicitly deferred Phase 5/7. | Deferral is documented; not an oversight. |
| **CR-F1** admin.ts vs CONTRIBUTING contradiction | harmonized | **Yes** | lib/supabase/admin.ts:7-13 and CONTRIBUTING.md:61 now both say: safe inside use cache, partition on identity, user-agnostic reads need no partition. | None. |
| **CR-F2** = F6 above | - | Yes | see F6 | see F6 |
| **CR-F3** root layout warning | comment added | **Partial** | app/layout.tsx:6-10. | **Comment overstates risk for error.tsx.** Per Next.js 16 docs, error.tsx renders inside the closest layout boundary, inheriting its shell. Only global-error.tsx replaces the root layout and needs its own html/body. Comment lumps both together. |
| **CR-F4** withPrefix() validation | KEY_RE + SCAN_PATTERN_RE split | **Yes** | lib/upstash.ts:14 (KEY_RE), :17 (SCAN_PATTERN_RE), :35-40 (withScanPattern), :63 (cache.scan uses scan helper). foo-bar with space fails; FOO fails (uppercase); foo?bar fails (?); foo[1] fails ([); foo:* passes via SCAN_PATTERN_RE only. Rate-limiter regex (:75) unchanged. No callsite routes * through withPrefix. | Empty string fails both. SCAN_PATTERN_RE allows pattern starting with * - intended admin-sweep behavior documented at :58-60. |

**Accept-and-document items (F1, F4, F5):**
F1 partially covered in docs/supabase-shared-config.md Backup-and-restore + Forbidden-operations sections (lines 94-107). F4 (auth.users enumeration, key blast radius) is **not addressed** - there is no docs/threat-model.md. F5 dissolves with QStash-to-Vercel-Cron decision but that decision is not yet documented.

---

## Still Hand-Wavy

1. **docs/supabase-shared-config.md has 5 _(fill in)_ placeholders** (project ref, region, magic-link decision, OAuth, HIBP, password sender). Net-positive only if the user fills them in - otherwise it is doc-debt creating false confidence.
2. **F4 threat model never landed.** Brainstormer recommended docs/threat-model.md with explicit invite-only-siblings OR accept-enumeration-risk. User clarified verbally; nothing recorded.
3. **F5 QStash-to-Vercel-Cron migration decision** not documented. PLAN.md section 2.4 still shows QStash as canonical reminder path.
4. **Preflight ALLOWED_PROJECT_REFS is empty.** Every pnpm db:push exits 1 until someone edits the file. See new-footguns a.

---

## New Foot-Guns Introduced

**a. Preflight always fails on a fresh clone.** ALLOWED_PROJECT_REFS = [] triggers exit. Intent is edit-in-a-PR. Right governance default, but first db:push after clone breaks with an error pointing at the file. README.md does not mention this. Mitigation: one sentence in README under First-time-setup.

**b. ESLint override is broader than F3 requested.** files: [lib/upstash.ts, lib/supabase/**/*.ts] allows any file under lib/supabase/** to import raw @supabase/supabase-js. A future lib/supabase/utils.ts becomes a quiet back door. Brainstormer F3 said outside lib/supabase/{server,client,session}.ts - current rule is **looser than requested**. Tighten to explicit filenames.

**c. NEXT_PUBLIC_APP_ENV .default(dev) is now a misleading hint.** superRefine closes the prod scenario, but the default still tells contributors dev is the fallback. A next build locally with prod env vars has no VERCEL_ENV, so the cross-check is skipped - exactly the scenario where the default lies. Recommendation: keep default, add console.warn when VERCEL_ENV unset AND APP_ENV used its default.

**d. VERCEL_ENV Zod enum brittle to future Vercel values.** z.enum([production, preview, development]) will hard-fail if Vercel ever adds a value (e.g. staging, branch). Error message will say Invalid enum value for VERCEL_ENV - confusing because the user did not set it. Safer: z.string().optional() with a tolerant map lookup.

**e. Root-layout warning misstates error.tsx.** See CR-F3 row. Cost: 1 line of comment edit.

---

## Good Calls (stronger than asked)

- **SCAN_PATTERN_RE separation.** Code-reviewer asked for a single tightened regex. Implementer split write-keys vs scan-patterns - strictly better. Writes can never contain *; scans cannot contain uppercase.
- **KEY_RE requires alphanumeric start** - forbids :foo, -foo, --foo. Tighter than reviewer suggestion.
- **Form-error surfacing.** lib/env/server.ts:48-49 adds formErrors to thrown message. Without this, the cross-check would have thrown opaquely.
- **pnpm-workspace.yaml esbuild: true.** Necessary for tsx on Windows; easy to miss until pnpm install fails.
- **Shared-config doc covers more than F2 asked.** Includes Realtime channel namespacing, Storage bucket conventions, exposed-schemas registry, Forbidden-operations list - items raised in F1/F8 (partial F1 coverage as side effect).

---

## Final Verdict

- **All 6 brainstormer must-fix items: 5 closed, 1 deliberately deferred (F7).**
- **All 4 code-reviewer must-fix items: 3 fully closed, 1 partial (CR-F3 wording overstates error.tsx risk).**
- **Accept-and-document items: F1 partially covered; F4 + F5 not documented.**
- **5 new foot-guns introduced** (one - the over-broad ESLint override - is regression on what F3 originally asked).

**Verdict:** **Phase-1-unblocking.** Every fix is structurally correct and residuals are small. Recommend a 30-min follow-up to: (1) fix CR-F3 comment, (2) tighten ESLint override to explicit filenames, (3) add docs/threat-model.md with sibling-invite-only policy + QStash retirement decision, (4) note ALLOWED_PROJECT_REFS edit in README. None block starting Phase 1.

## Unresolved Questions

- Will user fill in the _(fill in)_ placeholders in supabase-shared-config.md before Phase 1 touches Auth?
- Is QStash-to-Vercel-Cron migration firm or tentative? Affects whether PLAN.md section 2.4 needs an update now.
- Should ALLOWED_PROJECT_REFS ship pre-populated with the known project ref? Not secret (per script comment line 14-15) - would avoid the fresh-clone foot-gun.
