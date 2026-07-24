# Doctor / Clinician Usability Review — BSK Web Rewrite

Date: 2026-07-24
Reviewer: ui-ux-designer (agent)
Scope: report-only, no code changed. Lens = busy Vietnamese small-clinic doctor.
Built so far: Phase 0 + Phase 1 (sign-in, role-gated shell, dashboard placeholder, admin invite, i18n). Phases 3/4/6 (queue, checkup, prescription, print) are plan-only.

Note: original repo README is empty ("I will write readme later I promise") — no upstream workflow doc exists. Findings ground on PLAN.md §4 and VN small-clinic reality, not upstream copy.

---

## 1. Verdict

Foundations are clean and correct (RSC gating, server actions, i18n wiring, a11y attributes on forms are actually present — `aria-invalid`, `aria-describedby`, `role="alert"`). But **nothing doctor-facing is built yet**, and the built shell already carries habits that will hurt the doctor loop if carried into Phase 3–6: sub-44px targets, a broken focus ring, untranslated role labels, email-not-name identity, and a desktop-only sidebar. Fix the shell now so the checkup screen inherits good bones.

---

## 2. Current built UI — findings (doctor lens)

### 2.1 Identity shows email, not name — `dashboard/page.tsx:25`, `sidebar.tsx:36`
Doctor sees `Xin chào, bs.nam@clinic.vn` and a raw badge `doctor`. Clinicians think in names/titles ("BS. Nam"). Email as primary identity is developer-centric.
- Fix: greet by display name + title ("Xin chào, BS. Nguyễn Văn Nam"). Needs a `full_name`/`title` field (Phase 2 `staff_users`). Until then, at least de-emphasize email.

### 2.2 Role label is untranslated raw enum — `dashboard/page.tsx:30`, `sidebar.tsx:38`, `invite-user-form.tsx:121-124`
Displays literal `doctor` / `receptionist` / `admin` in both languages. A VN doctor sees English DB tokens. `messages/vi.json` has no role dictionary.
- Fix: add `roles: { doctor: "Bác sĩ", nurse: "Điều dưỡng", receptionist: "Lễ tân", cashier: "Thu ngân", admin: "Quản trị", patient: "Bệnh nhân" }` to both message files; render via `t()`. Applies to sidebar badge, dashboard badge, invite `<select>` options.

### 2.3 Broken focus ring on locale switcher — `locale-switcher.tsx:36`
`focus:outline-none` with **no** `focus:ring`/`focus-visible` replacement = invisible keyboard focus. Keyboard/Tab users lose their place. (Contrast: invite `<select>` at `invite-user-form.tsx:115` does it correctly with `focus:ring-2`.)
- Fix: add `focus-visible:ring-2 focus-visible:ring-ring` (mirror the invite select).

### 2.4 Touch/click targets below 44px everywhere
- Button `default` = `h-9` (36px), `sm` = `h-8` (32px), input = `h-9` (`button.tsx:22-24`, `input.tsx:11`).
- Sign-out is `size="sm"` (32px) — `sign-out-button.tsx:26`.
- Nav links `py-2` ≈ 36px tall — `sidebar.tsx:52`.
- Locale `<select>` `py-1` ≈ 28px — `locale-switcher.tsx:36`.
WCAG 2.1 AA target minimum is 44×44 (24px is the bare 2.2 floor). Doctors click fast, sometimes on touch-screen AIOs common in VN clinics. Small targets = misclicks mid-consult.
- Fix: introduce a comfortable density for primary clinical actions (min `h-11`/44px for pick-up, save, print, next-patient). Keep compact only for dense admin tables. Decide the density scale **now** so the checkup screen doesn't inherit 36px.

### 2.5 Low-contrast secondary text — `globals.css:9`
`--color-muted-foreground: oklch(0.556 0 0)` ≈ #767676. On white ≈ 4.5:1 (borderline pass for normal text, **fails** at the `text-xs` sizes used). The role badge is `text-xs` muted-foreground **on muted bg** (`sidebar.tsx:38`, oklch 0.97) ≈ ~4.0:1 — **fails AA**. Placeholder/help copy at `text-xs` shares the risk.
- Fix: darken muted-foreground to ~oklch(0.50) or don't use it at `text-xs`. Re-check badge fg/bg pair specifically.

### 2.6 Sidebar is desktop-only, no responsive collapse — `app-shell.tsx:25-28`, `sidebar.tsx:27`
Fixed `w-56` (224px), `flex h-screen`, no hamburger/drawer, no collapse. On a tablet/phone it permanently eats 224px. VN clinics are usually desktop AIO, so this is lower urgency — but a nurse checking the queue on a phone gets a cramped view. Also `h-screen` + `overflow-hidden` is fine on desktop but risky with mobile browser chrome (use `dvh`).
- Fix (Next): collapsible sidebar (icon-rail) + off-canvas drawer under `md`. Adopt shadcn `sidebar` primitive rather than hand-rolling.

### 2.7 No active-route highlight — `sidebar.tsx:49` (explicitly deferred)
Doctor can't tell which page they're on. Cheap orientation win; needed before there is >1 nav item per role.
- Fix: `usePathname()` compare, apply `bg-muted font-medium` + `aria-current="page"`.

### 2.8 Sign-in friction — `sign-in-form.tsx`
- No `autoFocus` on email — doctor must click before typing (minor but repeated every shift start).
- No show-password toggle, no Caps-Lock hint — VN keyboards + shared clinic PCs make mistyped passwords common.
- Submit disabled logic `!isValid && isDirty` (`:131`) can leave the button greyed with no explanation on a partially-touched form; some users read a disabled primary button as "app is broken."
- No skip-link / landmark at app level for keyboard users.
- Fix (Now-cheap): `autoFocus` email, add password reveal, keep button enabled and surface errors on submit instead of disabling.

### 2.9 No web font / Vietnamese type strategy — `globals.css:11`
`--font-sans: ui-sans-serif, system-ui`. On Windows this resolves to Segoe UI, which does render VN diacritics — so not broken — but there's no `next/font`, no brand type, and diacritic-heavy stacked marks (ế, ữ, ộ) look inconsistent across the low-end machines a clinic actually owns.
- Fix (Later): load a VN-complete Google font via `next/font` (Be Vietnam Pro, Inter, or Noto Sans — all cover the full VN set) for consistent rendering + tighter line-height control for dense clinical forms.

### 2.10 i18n wording — generally natural, small nits
- `messages/vi.json` reads naturally. `nav.dashboard = "Trang chủ"` is fine; for a clinician "Tổng quan" (overview) may fit a stats dashboard better once it has content.
- `nav.checkups = "Khám bệnh"`, `nav.queue = "Hàng chờ"` — correct and idiomatic. Good.
- Invite success (`admin.invite.success`) leaks internal ops detail ("sao chép liên kết mời từ bảng điều khiển Supabase") into user copy — fine for an admin-only screen, not for clinicians. Leave for admin, don't reuse pattern elsewhere.

---

## 3. Planned clinical loop (Phase 3/4/6) — ergonomics risks

The plan's architecture is sound (Realtime queue, `useOptimistic`, cached snapshot + delta). Risks are all UX-shaped and not yet designed:

### 3.1 Queue (Phase 3) — the doctor's home base
- **One-key "next patient" pickup.** Plan says "pick up next in queue" but no interaction spec. Doctor wants: big always-visible "Gọi bệnh nhân tiếp theo" button + keyboard shortcut. Don't bury pickup behind a row menu.
- **At-a-glance status.** Queue must use color + text + icon (not color alone — a11y) for waiting / in-progress / done / recheck. Show wait time and queue number large. `daily_queue_counters` exists in schema; surface the number prominently.
- **Realtime staleness signal.** When the socket drops, the doctor must SEE "đang cập nhật…/mất kết nối" — a silently stale queue causes double-calling a patient. Design a connection indicator + last-updated timestamp.
- **Quick search.** Plan has no queue search. In a 40-patient day a doctor needs to jump to a name/queue-number instantly (keyboard `/` to focus search).

### 3.2 Checkup form (Phase 3) — where the doctor spends the day
- **Single screen, not a wizard.** Vitals + diagnosis + conclusion + recheck date should be one keyboard-tabbable screen. A multi-step wizard multiplies clicks per patient × 40/day.
- **Keyboard-first.** Tab order top-to-bottom, `Ctrl+S`/Enter-to-save, no mouse required. This is the single biggest "easy for doctors" lever and it must be designed, not defaulted.
- **Autocomplete + favorites.** Diagnosis and (Phase 4) medicine fields need type-ahead + a per-doctor "frequently used" list. Free-text-only diagnosis slows everyone.
- **Autosave / no-loss.** Optimistic UI is planned; also guard against navigating away with unsaved vitals (confirm dialog).
- **Recheck date fast-set.** Common intervals as chips (+3d, +1w, +1m) beside the date picker.

### 3.3 Prescription + billing (Phase 4)
- Plan already lists "search medicines, set dosage/quantity, autosum" — good. Add: dose templates (e.g. "1 viên × 2 lần/ngày × 5 ngày" presets), keyboard add-row, running total always visible, duplicate-drug warning.
- Doctor usually composes prescription; cashier bills. Keep the doctor's prescription screen free of payment fields to reduce cognitive load.

### 3.4 Printing (Phase 6)
- Non-goal "native printer drivers" (PLAN §6) is fine, but VN clinics print prescriptions on pre-printed/specific paper. Browser print margins + headers/footers will fight this. Design print CSS (`@page`, hidden nav, exact mm sizing) early and test on a real printer. Offer PDF download as the reliable fallback.
- Provide a print preview that matches output; doctors distrust "print and pray."

---

## 4. Accessibility & responsiveness summary

| Area | State | Action |
|---|---|---|
| Form a11y (labels, aria-invalid, role=alert) | Good — already correct | keep pattern |
| Focus visibility | Broken on locale switcher (§2.3) | fix now |
| Touch targets ≥44px | Fails (36/32/28px) (§2.4) | set density now |
| Contrast (muted text/badge) | Borderline/fails at text-xs (§2.5) | darken token |
| Color-only status | Not yet built — enforce icon+text in queue (§3.1) | design rule |
| Responsive shell | Desktop-only sidebar (§2.6) | next |
| prefers-reduced-motion | No motion yet; add rule before animations land | later |
| Keyboard shortcuts | None; critical for checkup (§3.2) | design in Phase 3 |
| Skip-link / landmarks | Missing | now-cheap |

No `docs/design-guidelines.md` exists (docs/ has runbooks, supabase-shared-config, threat-model). There is no documented design system / token scale / density spec — so each new phase will re-invent spacing and sizing. Create one before Phase 3.

---

## 5. Recommendations — prioritized

### NOW (before/with Phase 3, cheap, prevents debt)
1. Fix locale-switcher focus ring (§2.3) — 1 line, real a11y bug.
2. Localize role labels via a `roles` message dict (§2.2) — sidebar, dashboard, invite select.
3. Set a **clinical density scale**: primary clinical actions ≥44px; document it. Add `lg`/44px usage rule for pickup/save/print (§2.4).
4. Darken `--color-muted-foreground` and re-check the badge fg/bg pair for AA (§2.5).
5. Active-route highlight + `aria-current` in sidebar (§2.7).
6. Sign-in: `autoFocus` email, password reveal, stop disabling the submit button (§2.8).
7. Create `docs/design-guidelines.md` (tokens, density, status-color+icon rules, keyboard conventions) so Phase 3 inherits it.

### NEXT (Phase 3/4 design work)
8. Design queue screen: one-key next-patient + shortcut, large queue number, icon+text+color status, wait time, realtime connection indicator, `/`-to-search (§3.1).
9. Design checkup as a single keyboard-tabbable screen with Ctrl+S save, autocomplete diagnosis, recheck-date chips, unsaved-changes guard (§3.2).
10. Prescription composer: dose templates, keyboard add-row, always-visible total, duplicate-drug warning (§3.3).
11. Responsive shell: collapsible icon-rail + off-canvas drawer under `md`; switch to shadcn `sidebar`; use `dvh` (§2.6).
12. Greet by name/title once `staff_users` exists (§2.1).

### LATER (Phase 6/8 polish)
13. Print CSS with `@page` mm sizing + preview matching output; PDF fallback; test on real printer (§3.4).
14. Load a VN-complete Google font via `next/font` (Be Vietnam Pro / Inter / Noto Sans) (§2.9).
15. `prefers-reduced-motion` guard before adding queue/optimistic animations.
16. Empty states / skeletons / error boundaries for the queue and checkup (already in Phase 8).

---

## 6. What is already good (keep)
- Server-side role gating is defense-in-depth and correct (`(app)/layout.tsx`, `admin/layout.tsx`).
- Form components carry real a11y wiring (aria-invalid, described-by, role=alert, sr-only labels).
- i18n plumbing is clean; VI copy is largely natural.
- ROLE_MENU as single source of truth for nav — extensible and safe.

---

## Unresolved questions
1. Deployment target device: desktop AIO only, or tablets/phones too? Decides urgency of §2.6 responsive work.
2. Touch-screen clinics? If yes, 44px targets become mandatory, not recommended.
3. Is there a `full_name`/`title` on staff for name-based greeting, or is email the only identity until Phase 2?
4. Printer reality: pre-printed prescription paper / thermal / A5? Drives Phase 6 print CSS.
5. Does the clinic want per-doctor favorites (diagnoses/drugs) — needs a small prefs table; confirm scope.
6. Keyboard-shortcut expectations carried over from the Swing app? (README empty; may need the original author or a real user to confirm.)
