# Code Review — Phase 0 Fix Verification

Adversarial regression check on 8 must-fix items applied to the BSK Phase 0 scaffold.
Scope: verify fixes close their findings; flag regressions; do not expand scope.

## Per-fix results

### #1 README.md stack version — PASS
`README.md:15` reads `**pnpm** + **Next.js 16** (App Router) + **TypeScript**`. Matches `package.json:31` (`"next": "^16.2.6"`). Trivial fix landed.

### #2 admin.ts JSDoc + CONTRIBUTING.md harmonization — PASS
- `lib/supabase/admin.ts:9-13` and `CONTRIBUTING.md:61` now both say the same thing: admin client is safe inside `'use cache'`, but identity-dependent results MUST partition the cache key on the identity; user-agnostic reads need no partitioning.
- No contradiction with `CONTRIBUTING.md:59` ("`server.ts` reads cookies → never call from `'use cache'`"). Coherent.

### #3 KEY_RE + SCAN_PATTERN_RE — PASS_WITH_NIT
- `lib/upstash.ts:14` `KEY_RE = /^[a-z0-9][a-z0-9:-]*$/` correctly forbids spaces, glob chars (`*`, `?`, `[`, `]`), control chars, uppercase, and leading `:`/`-`.
- `lib/upstash.ts:17` `SCAN_PATTERN_RE = /^[a-z0-9:*-]+$/` allows `*` only for SCAN.
- `lib/upstash.ts:63` `cache.scan` correctly routes through `withScanPattern`, not `withPrefix`. ✓ (matches review concern (a))
- Planned keys from `PLAN.md:62` and `CONTRIBUTING.md:102-104` all validate: `queue:42` ✓, `ratelimit:login` ✓, `session:user-abc` ✓, `user:abc-123` ✓.
- Every caller of `withPrefix`/`withScanPattern` is internal to `lib/upstash.ts` (`get`/`set`/`del`/`scan`). No bypass path.
- **Nit:** `SCAN_PATTERN_RE` permits a pattern that is just `"*"` (sweeps the whole namespace) — intentional per JSDoc at `lib/upstash.ts:58-60`, acceptable for admin tools. Worth keeping in mind as a foot-gun.

### #4 server.ts VERCEL_ENV cross-check — PASS_WITH_NIT
- `lib/env/server.ts:5-9` map is exhaustive over the three `VERCEL_ENV` values (`production` / `preview` / `development`).
- `lib/env/server.ts:31` early-return when `VERCEL_ENV` is absent correctly bypasses for local dev.
- Error message at `lib/env/server.ts:37` names both env vars and the expected value. ✓
- **Nit (review item d):** `lib/env/server.ts:48-49` surfaces `formErrors` in the throw — but the custom issue is added with `path: ["NEXT_PUBLIC_APP_ENV"]`, which routes it into `fieldErrors`, not `formErrors`. Verified empirically (Zod v4.4 `flatten()` with `path` always goes to `fieldErrors`). The `formText` branch is dead code for the cross-check, only firing if Zod itself ever emits a path-less issue. Harmless but misleading — could be removed, or the cross-check could drop the `path:` to land in `formErrors` instead.
- No circular import risk: `client.ts` does not import from `server.ts` (`lib/env/client.ts` is self-contained).
- Local-case (no `VERCEL_ENV`) validation is NOT weakened — all other fields still validated normally.

### #5 eslint.config.mjs no-restricted-imports — PASS_WITH_NIT
- `eslint.config.mjs:19-40` blocks `@upstash/redis`, `@upstash/ratelimit`, `@supabase/supabase-js`.
- `eslint.config.mjs:44-47` override unblocks `lib/upstash.ts` and `lib/supabase/**/*.ts`. ESLint flat-config globs are CWD-relative — correct.
- **Re item (c) — `@upstash/qstash`:** NOT blocked. `lib/upstash.ts:4` is the only importer; `Receiver` has no prefix concerns (signature verification only, no Redis keyspace). Acceptable omission.
- **Re item (b) — barrel re-exports:** if a contributor creates `lib/supabase/raw.ts` re-exporting `createClient`, it would NOT be blocked (override applies). This is the intentional trust boundary — files under `lib/supabase/` are trusted to wrap the raw client. Future PRs should review additions to that directory.
- **Re item (d) — scripts/:** `scripts/preflight-supabase.ts` does NOT import any blocked module (`scripts/preflight-supabase.ts:18-19` only imports from `node:fs` / `node:path`). Future scripts would correctly be blocked unless added to the override.
- **Nit:** the override does not include `tests/` or `e2e/` — if Phase 0 ever adds test helpers that need raw clients (e.g. `supabase-admin` for seeding), they'll need an additive override or a wrapper in `lib/supabase/test-utils.ts`.

### #6 app/layout.tsx error.tsx warning — PASS_WITH_NIT
- `app/layout.tsx:6-10` adds the warning.
- **Accuracy check:** Standard Next.js docs say `error.tsx` is wrapped by its parent layout and does NOT need its own `<html>/<body>` — only `global-error.tsx` does. The comment claims both need it. However, **in this codebase specifically**, `app/layout.tsx` is a passthrough (`return children`), so a hypothetical `app/error.tsx` would lack a document shell, making the warning correct in context. The wording overstates the general rule but is practically right for BSK.
- **Recommendation:** consider clarifying "in this passthrough setup" — but functional content is sound.

### #7 docs/supabase-shared-config.md — PASS
- `docs/supabase-shared-config.md:11-15` uses honest placeholders for project ref / region (italicized `_(fill in: ...)_`), not fabricated values. ✓
- `docs/supabase-shared-config.md:35` "Anonymous sign-ins: disabled" — verified: Supabase Auth has an "Allow anonymous sign-ins" toggle (Authentication → Providers → Anonymous sign-ins, default off). Real setting. ✓
- No contradiction with `PLAN.md:56,62` (channel-prefix + redis-prefix rules) or `CONTRIBUTING.md:67,102-104` (same rules).
- `docs/supabase-shared-config.md:69` exposed-schemas list cites `bsk` only — consistent with `PLAN.md` schema-per-app.
- `docs/supabase-shared-config.md:75-78` bucket-prefix rule matches the channel-prefix rule.

### #8 runbook + preflight script — PASS_WITH_NIT
- **Runbook:**
  - `docs/runbooks/restore-from-bad-migration.md:34-39` `DROP SCHEMA bsk CASCADE; CREATE SCHEMA bsk` is correct — Postgres schemas are independent namespaces; cascading drop is scoped to objects inside `bsk` only. Sibling schemas untouched. ✓
  - `docs/runbooks/restore-from-bad-migration.md:79` GitHub Actions snippet is marked `# illustrative`. Acceptable. ✓
  - `docs/runbooks/restore-from-bad-migration.md:55` mentions `supabase_migrations.schema_migrations` — that's a Supabase-managed table, correct name.
- **Preflight script:**
  - `scripts/preflight-supabase.ts:30` reads `supabase/.temp/project-ref` — correct path per Supabase CLI v2. ✓
  - Exit code 1 on rejection via `process.exit(1)` at `scripts/preflight-supabase.ts:39`. ✓
  - `ALLOWED_PROJECT_REFS` is empty (`scripts/preflight-supabase.ts:23-25`) and the script intentionally fails closed at line 51-56 — good fail-safe.
- **Windows `&&` in pnpm scripts:** `package.json:15` `"db:push": "pnpm db:preflight && supabase db push"`. pnpm executes scripts through a cross-platform shell wrapper (uses `cmd.exe` or `sh` via `npm-run-script`'s `script-shell` resolution). `&&` works on both Windows cmd.exe and POSIX shells. ✓ Verified pattern in `package.json`.
- **Nit:** preflight returns exit 1 even when allow-list is empty — this is intentional (fail-closed) but means `pnpm db:push` will fail until someone adds a ref. Worth a note in the runbook or README "first-time setup" section.

### Supporting: pnpm-workspace.yaml — PASS
- `pnpm-workspace.yaml:4` `esbuild: true` under `allowBuilds:`. Confirmed correct shape for pnpm 11 — `allowBuilds` is the map key, package name → boolean. ([pnpm 11 release notes](https://pnpm.io/blog/releases/11.0))

## Regressions introduced

None detected. All fixes are additive (Zod cross-check, ESLint blocklist, key validation, docs); none weaken existing validation:
- Local-dev `VERCEL_ENV`-absent case still runs all base field validators.
- New regexes are stricter than the old `key.includes(" ")` check — no shape that passed before fails now except space-containing keys (which were a bug).
- ESLint blocklist applies to all non-factory files; the factories themselves still lint clean since they import from the lib paths that are unblocked.

## Still-open from original review

None of the 8 items are unresolved. Two warrant minor follow-ups (non-blocking):
- **#4 dead `formErrors`** — either remove the `formText` branch or drop the `path:` on the cross-check addIssue so it lands in `formErrors` legitimately (one-liner either way).
- **#6 `error.tsx` wording** — minor clarification that the warning applies because `app/layout.tsx` is a passthrough; otherwise `error.tsx` inherits its parent layout's shell.

## Red-team angles verified

- **TOCTOU / silent fallback:** none introduced. The Zod cross-check is synchronous and fail-fast at module load.
- **Local-case weakening:** verified at `lib/env/server.ts:31` — early-return is the only short-circuit, all field validators still run.
- **Sneaky-helper bypass:** acknowledged design choice — `lib/supabase/**/*.ts` is the trust boundary; reviewers must police additions to that dir.
- **KEY_RE valid-shape rejection:** none of the planned key shapes from `PLAN.md` / `CONTRIBUTING.md` are rejected.

## Verdict

**Ready to commit** — with 2 minor follow-ups (non-blocking nits, can land in a follow-up commit):
1. Clean up the dead `formErrors` branch in `lib/env/server.ts:48-49`.
2. Tighten the `error.tsx` wording in `app/layout.tsx:6-10` to reference the passthrough context.

## Unresolved questions

None.

**Status:** DONE_WITH_CONCERNS
