# Phase 8 — Polish

**Depends on:** all prior phases (polishes their surfaces). Last phase.
**Goal:** Production-grade finish for the educational build — branding, consistent states, accessibility, performance, docs. No new domain features.

Original: SettingsDialog (branding/clinic config — clinic-info edit done Phase 2; branding assets here). Everything else is cross-cutting quality.

## Slices

| # | Slice | Scope |
|---|---|---|
| 8a | Clinic branding settings | logo upload + display name/colors used in header + PDF letterhead (Phase 6) |
| 8b | Empty / error / loading states | every list route: empty state, `error.tsx` boundary, `loading.tsx` skeleton |
| 8c | Accessibility pass | labels, focus order, keyboard nav, aria on realtime queue, contrast (design-guidelines.md) |
| 8d | Performance / Lighthouse | Core Web Vitals ≥90; image lazy-load; bundle check |
| 8e | Docs + attribution | README walkthrough; NOTICE/ATTRIBUTIONS verified; docs/ updated |

## 8a — Branding

- Extend `clinic_settings` (Phase 2) with branding fields if absent: `logo_path text` (Supabase Storage, `bsk-public-assets` bucket per PLAN §2.3), `display_name`, optional accent color. Admin-only edit (existing settings route).
- Logo feeds: app header + PDF letterhead (Phase 6 documents consume it). Reuse image upload pattern (Phase 5) but a public-ish asset bucket (still RLS; served via signed or public-read policy for logo only — confirm).
- No PII; small asset — outside 7-day media sweep (exempt path prefix).

## 8b — States (apply to all list/detail routes)

- Empty states: patients, queue, checkups, medicines, services, recheckup list, images gallery, dashboard-no-data.
- `error.tsx` boundaries per route group (`(app)` + feature subtrees) — friendly message + retry, no stack leak.
- `loading.tsx` skeletons for RSC data routes.
- Match existing `t("empty")` pattern already used in doctors/page.tsx.

## 8c — Accessibility

- Follow `docs/design-guidelines.md`.
- Realtime queue: `aria-live="polite"` region so status changes announce.
- Forms: every input labeled (already largely done via RHF); error messages associated (`aria-describedby`).
- Keyboard: queue call/complete actions reachable; focus management on modal/route transitions.
- Color contrast: clinician-focused UX pass (commit 653aca1) baseline; verify AA.

## 8d — Performance

- Lighthouse ≥90 (Perf/A11y/Best-Practices/SEO) on key routes: sign-in, dashboard, queue, patient list.
- Image lazy-loading in gallery; signed-URL thumbnails sized.
- Verify Turbopack build has no `'use cache'` violations (CI already gates — PLAN §7).
- Bundle: no accidental server-only lib in client; check recharts/bwip-js/react-pdf are not bloating client bundles (react-pdf server-only).

## 8e — Docs & attribution (PLAN §8)

- README: end-to-end walkthrough (sign-in → register patient → queue → checkup → prescribe → invoice → print → reminder). Screenshots optional.
- `NOTICE` file: original project, author handle, educational/non-commercial purpose (PLAN §8.3).
- README credit + upstream link at top (PLAN §8.2).
- Verify `docs/` updated: system-architecture (final phase list), roadmap marked complete, changelog if present.
- Confirm "synthetic data only / no HIPAA" disclaimer (PLAN §6) in README.
- Open upstream GitHub issue asking author to choose a license (PLAN §8.4) — user action, note it.

## RLS / access

- Branding edit: admin (settings route already admin-gated). Logo bucket: read-any-enrolled (or public-read for logo only — confirm), write admin.
- No new clinical tables.

## Test matrix

- **Vitest:** none new (polish).
- **Integration:** error boundary renders on forced action failure (no leak).
- **E2E/manual:** Lighthouse run; keyboard-only nav of queue→checkup→prescribe; screen-reader spot check on realtime queue.

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Lighthouse regressions from realtime/charts | Med×Low | lazy-load charts; measure; defer non-critical JS |
| Logo bucket accidentally fully public | Low×Med | scoped public-read policy for logo path only, not whole bucket |
| Attribution/license gap (no upstream license) | Med×Med | clean-room note + NOTICE + upstream issue (PLAN §8) |
| Error boundary leaks stack in prod | Low×Med | generic message; log server-side only |

## Rollback

Pure enhancement — each slice independently revertible with no data impact.

## Open DECISIONS

- Logo bucket visibility: scoped public-read (simpler for header/PDF) vs signed-URL always. Default: scoped public-read for `logo/` prefix only.
- (All major product DECISIONS resolved in earlier phases; Phase 8 has no blocking product questions.)

## Acceptance

typecheck/lint/build green; every list has empty/error/loading state; Lighthouse ≥90 on key routes; keyboard + SR pass on queue; branding logo in header + PDF; README walkthrough + NOTICE present; VI/EN complete.
