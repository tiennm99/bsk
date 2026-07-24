# Doctor / Clinician Usability RE-Review (post-fix) — BSK Web

Date: 2026-07-25
Reviewer: ui-ux-designer (agent)
Scope: report-only, no code changed. Verify prior NOW findings resolved; flag new issues. All changes uncommitted, reviewed on disk.
Prior report: `plans/reports/doctor-usability-260724-2243-clinician-ux-report.md`

---

## 1. Verdict

Solid fix pass. 9/9 prior NOW findings addressed; 6 genuinely fixed, 3 fixed-but-partial (locale select + sign-out still sub-44px; skip-link still missing). One real NEW bug: the responsive drawer has no focus management (no trap, no Esc, broken tab order) and duplicates the sidebar tree (duplicate DOM ids). `docs/design-guidelines.md` is a good guardrail doc but does not capture the Phase 3 interaction ergonomics from prior §3.

---

## 2. Prior NOW findings — verification

### §2.3 Locale focus ring — FIXED
`locale-switcher.tsx:36` now `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`. Correct token (`ring-ring`), mirrors the invite select. Keyboard focus visible.

### §2.2 Untranslated role enums — FIXED
`roles` dict present in both `messages/vi.json:25-32` and `en.json:25`. Rendered via `tRoles()` in `sidebar.tsx:38`, `dashboard/page.tsx:32`, `invite-user-form.tsx:123-125`. No raw enum reaches UI. `openMenu`/`showPassword`/`hidePassword`/`welcome{name}` all present in both locales.

### §2.4 Sub-44px targets — PARTIAL
Fixed: Button `lg` = `h-11`/44px (`button.tsx:25`); sign-in + invite submits use `size="lg"` (`sign-in-form.tsx:149`, `invite-user-form.tsx:142`); nav rows `min-h-11` (`sidebar-nav.tsx:43`); hamburger `size-11`/44px (`app-shell-frame.tsx:63`).
Still under 44px:
- **Sign-out** still `size="sm"` = `h-8`/32px (`sign-out-button.tsx:26`). Sidebar chrome, not core loop, but 32px is below the 40px icon floor too.
- **Locale `<select>`** still `py-1 text-xs` ≈ 28px tall (`locale-switcher.tsx:36`). Unchanged height.
- **Password toggle** 40×40 (`w-10` + `h-10` input) (`sign-in-form.tsx:127`). Under 44 on touch AIO; acceptable for a login-only control.
- **Input** `h-10`/40px (`input.tsx:11`). Guidelines don't mandate 44 for inputs; note for touch clinics.
Verdict: core clinical/primary actions now compliant; secondary chrome (sign-out, locale) left small. Acceptable per the density rule but worth a cheap bump since they live in the doctor's persistent shell, not an admin table.

### §2.5 Low-contrast muted text / badge — FIXED
`--color-muted-foreground` now `oklch(0.5)` (`globals.css:10`) ≈ ~6.3:1 on white — passes AA at `text-xs`. Badge fg/bg pair fixed: both `sidebar.tsx:37` and `dashboard/page.tsx:31` now use `text-foreground` on `bg-muted` (near-black on near-white, very high contrast) instead of muted-on-muted. Matches the guideline rule in `design-guidelines.md:9`. Dark-mode `muted-foreground` (0.708 on 0.145 bg) also passes.

### §2.6 Desktop-only sidebar — FIXED (with new drawer a11y gaps, see §3)
`app-shell-frame.tsx` (NEW client): persistent sidebar `hidden md:flex` (:41), off-canvas drawer + backdrop below md (:44-53), hamburger top-bar `md:hidden` (:57-68), `h-dvh` (:39), drawer closes on route change via render-time state compare (:32-36). Structurally correct. Did not adopt shadcn `sidebar` primitive (hand-rolled) — fine for this scope but no focus/Esc handling came with it (§3.1).

### §2.7 No active-route highlight — FIXED
`sidebar-nav.tsx:35-46`: `usePathname()` compare (`===` or `startsWith(${href}/)`), applies `bg-muted font-medium` + `aria-current="page"`. next-intl pathname is locale-stripped so match is correct. `startsWith` uses trailing `/` so no false prefix matches.

### §2.8 Sign-in friction — FIXED (skip-link still missing)
`autoFocus` on email (`sign-in-form.tsx:91`); show/hide password toggle with `aria-pressed` + `aria-label` (:121-130); submit no longer disabled on partial/invalid input — only on `isPending` (:153). Good. NOT done: app-level skip-link / landmark for keyboard users (prior §2.8 last bullet; `design-guidelines.md:22` promises one — still absent, see §4 residual). Caps-Lock hint not added (was optional).

### §2.9 No VN font — FIXED
`Be_Vietnam_Pro` via `next/font/google` with `subsets:["latin","vietnamese"]`, weights 400-700, `variable:"--font-be-vietnam-pro"`, `display:"swap"` (`app/[locale]/layout.tsx:19-24`); variable applied on `<html>` (:72); consumed by `--font-sans` (`globals.css:12`). Stacked diacritics now render from a bundled font. `prefers-reduced-motion` guard also added (`globals.css:41-50`).

### §2.1 Greet by email not name — FIXED
`get-server-session.ts:75-86` fetches `app_users.full_name` (own-row RLS), non-fatal fallback to null. `dashboard/page.tsx:24` `name = fullName || email`. `sidebar.tsx:35-36` shows `fullName || email` primary, email demoted to secondary line only when name set. Correct.

---

## 3. NEW issues introduced this pass

### 3.1 Drawer has no focus management — `app-shell-frame.tsx:44-53` (HIGH for keyboard/AT)
The off-canvas drawer is a plain conditional div, not a modal dialog:
- **No focus trap / no focus move-in.** On open, focus stays on the hamburger; focus can tab into page content behind the backdrop.
- **No Esc to close.** Only the backdrop `onClick` (mouse) and route-change close it. Keyboard/AT users have no dismiss path.
- **Broken tab order.** DOM order is drawer (:44) → header/hamburger (:57) → main. Trigger sits *after* the drawer, so tabbing forward from the hamburger goes into `main`, skipping the drawer; the drawer is only reachable via Shift+Tab. Confusing.
- **No dialog semantics.** Backdrop div is `aria-hidden` (ok) but the drawer container has no `role="dialog"`/`aria-modal`/label, and the hamburger has no `aria-controls`. Screen readers don't announce a modal surface.
- Fix: promote to a real modal drawer — move focus to first nav item on open, trap focus, close on Esc, `role="dialog" aria-modal="true"` + `aria-labelledby`, `aria-controls` on the hamburger, and lock body scroll. Adopting shadcn `Sheet`/`sidebar` gets all of this for free (guideline `design-guidelines.md:36` already prefers the shadcn primitive).

### 3.2 Sidebar tree duplicated → duplicate DOM ids — `app-shell.tsx:25` + `app-shell-frame.tsx:41,51` (MEDIUM)
The same `<Sidebar>` node is rendered in both the persistent container and the drawer container. When the drawer is open on mobile, `LocaleSwitcher`'s `id="locale-select"` (+ its `htmlFor`) and the `<nav aria-label="Main navigation">` landmark exist twice in the DOM. The persistent copy is `display:none` (`hidden`) so the a11y-tree impact is mostly suppressed, but it's invalid HTML and `getElementById('locale-select')` / label association resolves to the hidden copy. Fix: render one sidebar instance and reparent, or give drawer instances distinct ids, or (cleanest) use shadcn `sidebar` which handles the single-source responsive swap.

### 3.3 Minor
- Submit buttons set both `disabled` and `aria-disabled` (`sign-in-form.tsx:153-154`, `invite-user-form.tsx:147`). Redundant — a truly `disabled` button is already removed from AT/tab; `aria-disabled` adds nothing. Harmless, drop one.
- Mobile drawer doesn't lock background scroll (page scrolls behind overlay). Low.
- `size="lg"` full-width submits on mobile: fine — 44px tall full-width is good ergonomics, not an issue.

---

## 4. Planned clinical loop (Phase 3/4/6) — brief reassessment

Unchanged since last pass; architecture still sound. `docs/design-guidelines.md` now exists and captures the right *guardrails*: 44px clinical density (:11-18), keyboard-first + `/`-search + one-key next-patient (:19-22), status = color+icon+text (:24-25), no raw enums (:27-30), identity by name (:32-33), responsive icon-rail/drawer + `dvh` + prefer shadcn (:35-36), print CSS + PDF fallback (:41-42).
Gaps vs prior §3 detail (not blocking, note for Phase 3 spec): guidelines omit the **realtime staleness / connection indicator**, **diagnosis/medicine autocomplete + per-doctor favorites**, **unsaved-changes guard**, **recheck-date chips**, and **dose templates / duplicate-drug warning**. These are interaction specs, not token rules — fine to defer to the Phase 3 design doc, but capture them there so they aren't lost.

---

## 5. Residual recommendations

### NOW (cheap, before Phase 3)
1. Fix drawer a11y (§3.1): focus trap + move-in, Esc close, `role="dialog"`/`aria-modal`/label, `aria-controls`, body-scroll lock. Prefer shadcn `Sheet`/`sidebar` — also resolves §3.2 duplication.
2. De-duplicate sidebar tree / fix duplicate `id="locale-select"` (§3.2).
3. Add the app-level skip-link → `main` (promised in `design-guidelines.md:22`, still missing). Give `<main>` an `id`.
4. Bump sign-out to ≥40px and locale select off 28px (§2.4) — they sit in the doctor's persistent shell.

### NEXT (Phase 3/4 design work — carry from prior §3)
5. Queue: one-key next-patient + shortcut, large queue number, icon+text+color status, wait time, **realtime connection/staleness indicator**, `/`-to-search.
6. Checkup: single keyboard-tabbable screen, Ctrl+S save, diagnosis autocomplete + favorites, recheck-date chips, unsaved-changes guard.
7. Prescription: dose templates, keyboard add-row, always-visible total, duplicate-drug warning.
8. Record items 5-7 into the Phase 3 design doc / extend `design-guidelines.md`.

### LATER (Phase 6/8 polish)
9. Print CSS `@page` mm sizing + preview matching output + PDF fallback; test on real printer.
10. Empty states / skeletons / error boundaries for queue + checkup.
11. Drop redundant `aria-disabled` on submit buttons; lock body scroll behind drawer.

---

## Unresolved questions
1. Deployment device — desktop AIO only, or real phone/tablet use? Governs how hard §3.1 drawer a11y must be pushed.
2. Touch-screen clinics? If yes, the residual sub-44px controls (sign-out 32px, locale 28px, password toggle/input 40px) should become mandatory bumps, not optional.
3. Is `bsk.app_users.full_name` actually populated for any staff yet, or does everyone still greet-by-email in practice until Phase 2 provisioning lands?
4. Adopt shadcn `sidebar`/`Sheet` now (fixes §3.1+§3.2 cleanly) vs. patch the hand-rolled drawer — scope preference?
5. Printer reality (pre-printed / thermal / A5) — still open, drives Phase 6.

Status: DONE_WITH_CONCERNS
Summary: All 9 prior NOW findings addressed (6 fully, 3 partial — locale/sign-out still sub-44px, skip-link still missing); one real NEW bug — the responsive drawer lacks focus trap/Esc/dialog semantics and duplicates the sidebar tree (duplicate DOM ids).
Concerns/Blockers: Drawer a11y (§3.1) and duplicate `id="locale-select"` (§3.2) are the only substantive new issues — both dissolve if the shell moves to the shadcn `sidebar`/`Sheet` primitive the guidelines already recommend.
