# NOW Hardening + Doctor-UX Foundation

**Status:** Phase 01 DONE + deferred cleanup DONE (see below). Remaining: print CSS + Playwright E2E only.
**Origin:** Consolidated from three review reports in `plans/reports/` (feature-parity, foundation code-review, doctor-usability), 2026-07-24.
**Goal:** Close the cheap, high-leverage gaps *before* Phase 2/3 so the clinical screens inherit good security + UX bones. Not feature work — hardening + UX debt.

## Decisions locked
- **H1 first-admin bootstrap → email allowlist.** Claim gated on caller's verified email in `bsk.admin_allowlist` (seeded by infra owner only). Uses `auth.uid()`, never a caller-supplied UUID.

## Phases
- **phase-01-now-hardening-and-ux.md** — this session. Security (H1, H2, M4) + cheap doctor-UX (focus ring, role i18n, active route, contrast, sign-in ergonomics) + `docs/design-guidelines.md`.

## Deferred cleanup — now DONE (this session, 2026-07-25)
| Item | Source | Outcome |
|---|---|---|
| Clinical density scale (≥44px primary actions) | UX §2.4 | `lg` button → 44px, input → 40px, primary submits use `size="lg"`, nav ≥44px |
| Responsive collapsible sidebar + `dvh` | UX §2.6 | `AppShellFrame`: persistent at md+, off-canvas drawer + hamburger below md |
| Greet by name | UX §2.1 | `app_users.full_name` already exists → session exposes `fullName`; dashboard + sidebar greet by name, email secondary |
| Invite existing-user + orphan safety | code-review M2/M3 | `inviteUserByEmail` existing-email → `errorEmailTaken`; non-dup enroll failure rolls back the auth row |
| `bsk.audit_log` migration | code-review, PLAN Phase 1 | Table + `log_audit()` SECURITY DEFINER writer + RLS (admin read); types added; call sites land with mutations |
| VN web font + prefers-reduced-motion | UX §2.9 | Be Vietnam Pro via `next/font`; reduced-motion guard in globals.css |

## Re-review round (2026-07-25) — fixes applied
Second agent pass (reports `*-260725-0028-*`) confirmed all prior findings resolved but caught regressions introduced by this pass. Fixed:
| Finding | Fix |
|---|---|
| F1 (HIGH) sign-in rate-limit keyed on spoofable leftmost `x-forwarded-for` | Key on `x-real-ip`, else last XFF hop |
| F2 (MED) limiter failed closed on Redis outage | try/catch → **fail open + `console.warn`** (user decision) |
| F3 (MED) `getServerSession` 3 sequential round-trips | Collapsed `current_role` RPC + `full_name` into one own-row `select("role, full_name")` |
| UX §3.1 (HIGH a11y) drawer had no focus trap/Esc/dialog role | Focus move-in + Tab trap + Esc + `role=dialog aria-modal` + `aria-controls` + body-scroll lock + focus restore |
| UX §3.2 (MED) duplicate `id="locale-select"` across two sidebar slots | `useId()` |
| UX residuals | Skip-link → `#main-content`, sign-out ≥40px, locale select taller, dropped redundant `aria-disabled` |
| F4 (MED) pre-existing-user enroll gap | **Documented** in `docs/supabase-shared-config.md` (user decision: manual SQL enrollment) |

F5/F6/F7 = note-only (educational scope). Verified: `pnpm typecheck` / `lint` / `build` all green.

## Still deferred
| Item | Source | Why |
|---|---|---|
| Print CSS (`@page`, preview) | UX §3.4 | No print views exist yet — premature until Phase 6 (YAGNI) |
| First Playwright E2E | code-review, PLAN Phase 1 | Playwright not installed; needs a live Supabase test project + seeded users + env to run — set up when a test project is available |

## Acceptance criteria (phase 01)
- `claim_first_admin()` is allowlist-gated, no caller-supplied UUID; direct writes on `app_users` revoked from `authenticated`.
- Sign-in + invite rate-limited via the existing `createRateLimiter`.
- Locale switcher has visible keyboard focus.
- Role labels localized (vi/en) in sidebar, dashboard, invite select.
- Active nav item highlighted with `aria-current="page"`.
- `--color-muted-foreground` meets AA at small sizes.
- Sign-in: email autofocus, password reveal, submit not disabled on partial input.
- `docs/design-guidelines.md` exists (tokens, density, status-color+icon, keyboard conventions).
- `tsc --noEmit`, `eslint .`, `next build` pass.

## Open questions (for lead)
1. Deployment target: desktop AIO only, or tablets/phones too? (drives responsive urgency)
2. Touch-screen clinics? (makes ≥44px mandatory)
3. Audit-log scope: writes only, or reads too?
