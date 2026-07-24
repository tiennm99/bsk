# BSK Design Guidelines

Primary users are clinic staff — doctors, nurses, receptionists, cashiers — working fast on desktop AIOs (often touch-screen), UI in Vietnamese. These rules exist so each phase inherits consistent, clinician-friendly bones instead of re-inventing spacing, contrast, and keyboard behavior. Keep this short; extend as phases land.

## Tokens
Theme lives in `app/globals.css` via Tailwind v4 `@theme` (light + `prefers-color-scheme: dark`). Never hard-code hex; use the semantic tokens (`background`, `foreground`, `primary`, `muted`, `muted-foreground`, `border`).

- `--color-muted-foreground` is `oklch(0.5)` (light) — passes WCAG AA at `text-xs`. Do not lighten it back.
- Do not put `text-muted-foreground` on `bg-muted` — that pair fails AA. Role badges use `text-foreground` on `bg-muted`.

## Density & touch targets
VN clinics use touch AIOs; doctors click fast mid-consult. Target sizes:

- **Primary clinical actions** (call next patient, save checkup, print, mark paid): **min 44×44px** (`min-h-11`).
- **Primary navigation** items: min 44px tall (`min-h-11`).
- Compact controls (`h-8`/`h-9`) are allowed **only** in dense admin tables/toolbars, never on the doctor's core loop.
- Icon buttons: 40px hit area minimum, 44px on clinical screens.

## Focus & keyboard
- Every interactive element must show a visible focus ring: `focus-visible:ring-2 focus-visible:ring-ring`. Never `focus:outline-none` without a replacement.
- The checkup and queue screens are **keyboard-first**: logical Tab order, Enter/`Ctrl+S` to save, `/` to focus search, one-key "next patient". Design shortcuts explicitly — don't rely on defaults.
- Provide a skip-link / landmark for keyboard users at the app shell level.

## Status communication (never color-only)
Queue/checkup status (waiting / in-progress / done / recheck) must combine **color + icon + text**. Color alone fails color-blind users and is ambiguous on cheap clinic monitors.

## i18n / wording
- Vietnamese is the default; English is the fallback. Every user-facing string goes through `next-intl` (`messages/{vi,en}.json`).
- **Never render raw DB enums** (roles, statuses) in the UI. Localize via a message dict — e.g. roles resolve through the `roles` namespace (`Bác sĩ`, `Lễ tân`, …).
- Keep operational/admin detail (Supabase dashboard hints, etc.) out of clinician-facing copy.

## Identity
Clinicians think in names/titles ("BS. Nguyễn Văn Nam"), not emails. Greet and label by `full_name` + role title once `staff_users` exists (Phase 2); until then de-emphasize the email.

## Responsiveness (when it lands)
Desktop-first is acceptable (VN clinics are desktop AIO), but the shell should collapse to an icon-rail + off-canvas drawer under `md`. Use `dvh` (not `h-screen`) to survive mobile browser chrome. Prefer the shadcn `sidebar` primitive over hand-rolled layout.

## Motion & polish (later)
Guard animations with `prefers-reduced-motion`. Every list/data screen needs empty states, loading skeletons, and error boundaries (Phase 8).

## Print (Phase 6)
VN clinics print on specific/pre-printed paper. Design print CSS early (`@page` mm sizing, hidden nav) with a preview that matches output, and always offer a PDF download fallback. Test on a real printer.
