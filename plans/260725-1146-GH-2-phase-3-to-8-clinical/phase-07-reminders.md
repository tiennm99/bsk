# Phase 7 — Reminders & Background Jobs

**Depends on:** Phase 3 (`checkups.remind_date`). Owns the cron infra that Phase 5's media-sweep plugs into. Parallel-safe with 4/5.
**Goal:** Surface & deliver recheckup reminders; run nightly cleanup. Original stored `remind_date` but had NO automated reminder — this is net-new behavior over the original.

Original commands: GetRecheckUpList (list side; write side `AddRemindDate` done in Phase 3).

## Slices

| # | Slice | Original | Data flow |
|---|---|---|---|
| 7a | Recheckup-due list (baseline) | GetRecheckUpList | RSC query checkups WHERE remind_date in due window; staff worklist |
| 7b | Nightly cleanup cron | (new; PLAN §7) | Vercel Cron → cleanup expired sessions/signed URLs + call Phase 5 media sweep |
| 7c | Reminder delivery (channel) | (new) | on/near remind_date, notify — in-app baseline, email optional |

## Delivery approach (DECISION 12 — KISS default)

**Default: single daily Vercel Cron scanning due rows** (not per-checkup QStash jobs):
- `/api/cron/recheckup-reminders` runs daily (VN morning). Admin client scans `checkups WHERE remind_date = vn_today()+? AND NOT deleted AND status='done'`.
- Bounded cardinality (one scan/day) — respects Upstash 10k/day & Vercel invocation limits trivially. No orphan jobs when remind_date changes (vs per-checkup QStash which leaves stale jobs).
- QStash per-checkup scheduling only if precise sub-day timing required — deferred (YAGNI). If adopted: schedule on `setRemindDateAction` (Phase 3) at remind_date−24h to `bsk-recheckup-reminders` topic; app verifies QStash signature at `/api/qstash/recheckup`.

**Channel (DECISION 11):**
- **Baseline (always):** in-app — the 7a recheckup-due list is the reminder surface. No external send, zero cost, no PII egress.
- **Optional (flagged):** email via Resend — send to patient/clinic. Behind `RESEND_API_KEY` presence check.
- **SMS:** deferred (needs provider + cost; PLAN §7).

## Cron infrastructure (7b — shared)

- `vercel.json` `crons` array (new file — none exists yet). Schedules:
  - `recheckup-reminders` — daily VN morning.
  - `nightly-cleanup` — daily; expired auth sessions housekeeping + **calls Phase 5 `/api/cron/sweep-media`** (or inline the sweep). Media 7-day retention lives in Phase 5; cron trigger owned here.
- All cron Route Handlers: verify caller is Vercel Cron (check `Authorization` / `x-vercel-cron` header or a shared `CRON_SECRET`); use **admin client** (system writes, no user context); audit `reminder.send`, `cron.cleanup`.
- Vercel Cron is per-project (no shared-infra concern, PLAN §2.4).

## Tables

- No new table required for baseline (reads `checkups.remind_date`).
- **Optional** `bsk.reminder_log` (id, checkup_id, channel, sent_at, status) to prevent duplicate sends + audit delivery. Recommended if email enabled (idempotency key = checkup_id+date). Default: add only when email channel turned on.

## RLS / access

- Recheckup list read: clinical (`admin,receptionist,doctor,nurse`) via user client + RLS.
- Cron handlers: admin client (bypasses RLS) — gated by CRON_SECRET, never user-reachable.
- `reminder_log` (if added): SELECT admin; writes via admin client only.

## Server actions / handlers

- `checkups/recheckup/page.tsx` — RSC due-list (reuse patient/checkup joins).
- `/api/cron/recheckup-reminders/route.ts` — scan + (optional) Resend send + reminder_log.
- `/api/cron/nightly-cleanup/route.ts` — session/URL cleanup + trigger media sweep.
- `lib/reminders/reminder-window.ts` — VN-tz due-date calc (24h-before), unit-tested.

## realtime/PDF/QStash

- **QStash:** only if per-checkup precise timing chosen (deferred). Signature verify at receiving route (PLAN §2.4). Topic `bsk-recheckup-reminders`.
- **Vercel Cron:** primary mechanism (default).
- No realtime, no PDF.

## Test matrix

- **Vitest:** due-window calc (remind_date−24h in VN tz; boundary at ICT midnight); duplicate-send guard (reminder_log idempotency).
- **Integration:** cron handler rejects missing CRON_SECRET; scan returns only due, non-deleted, done checkups.
- **E2E:** cron logic invoked directly (not scheduled) in test → asserts correct rows selected; Resend mocked.

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Duplicate reminders (multiple cron fires / retries) | Med×Med | reminder_log idempotency (checkup_id+date); or in-app-only baseline avoids sends entirely |
| Cron endpoint publicly triggerable | Med×High | CRON_SECRET / x-vercel-cron verification; admin client never user-exposed |
| Orphan QStash jobs on remind_date change | Med×Low | default daily-scan avoids this; QStash deferred |
| Upstash 10k/day breach | Low×Med | daily scan = O(1) commands; per-checkup QStash bounded 1/recheckup |
| Timezone drift (reminder fires wrong day) | Med×Med | VN-tz calc, unit-tested; cron scheduled in VN morning |
| PII in email (patient data egress) | Med×Med | email opt-in flag; minimal content; educational synthetic data only |

## Rollback

Remove cron entries from `vercel.json` + delete handlers → reminders stop, no data loss. In-app list is a pure read (drop route). reminder_log (if added) is additive.

## Open DECISIONS (plan.md #11, #12)

11. Reminder channel — in-app (default baseline) / email (Resend, optional) / SMS (deferred).
12. Trigger — daily cron scan (default, bounded, KISS) vs per-checkup QStash (precise, orphan risk).

## Acceptance

typecheck/lint/build green; due-list shows correct rows for VN due window; cron handlers reject unauthorized callers; media sweep triggered nightly; due-window calc unit-tested; VI/EN strings; (if email) idempotent, no duplicate sends.
