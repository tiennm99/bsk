---
title: "BSK Phases 3-8 — Clinical workflow, billing, imaging, reports, reminders, polish"
description: "Roadmap for remaining 42→ mapped commands: queue/checkup, prescriptions/billing, imaging, printing/reports, reminders, polish."
status: pending
priority: P1
effort: ~40h
branch: feat/hardening-ux-and-phase-2-core
tags: [clinical, queue, billing, imaging, pdf, realtime, qstash]
created: 2026-07-25
---

# BSK Phases 3-8 — Remaining Clinical Rewrite

Educational rewrite of the original Java/Swing/Netty/SQLite clinic system. Phases 0-2 done (auth, RBAC, audit skeleton, master data: doctors, clinic settings, patients+geo+search, checkup templates, staff). This plan covers the remaining source-grounded commands mapped in `plans/reports/researcher-260725-0048-...-report.md` §3.2.

Scope authority: PLAN.md §4 (phases 3-8), §5 (divergences), §6 (non-goals), §7 (free-tier risks). Every table/field is grounded in the audit report §1.3-1.4 or PLAN.md.

## Phase list & dependency order

| Phase | File | Delivers | Depends on |
|---|---|---|---|
| 3 | [phase-03-queue-checkup.md](phase-03-queue-checkup.md) | shifts, queue counters, checkups, realtime queue, checkup form, patient history | Phase 2 (customers, doctors, templates) |
| 4 | [phase-04-prescriptions-billing.md](phase-04-prescriptions-billing.md) | medicines, services catalogs; prescription composer; service assignment; invoice totals; cashier pay | Phase 3 (checkups) |
| 5 | [phase-05-imaging.md](phase-05-imaging.md) | Supabase Storage media per checkup, webcam capture, batch sync, barcode/QR, retention sweep | Phase 3 (checkups) |
| 6 | [phase-06-reports-printing.md](phase-06-reports-printing.md) | PDF invoice/prescription/ultrasound, Excel export, dashboard analytics | Phases 4 (billing) + 5 (images) |
| 7 | [phase-07-reminders.md](phase-07-reminders.md) | QStash recheckup reminders, Vercel cron cleanup, recheckup list, reminder channel | Phase 3 (checkups.remind_date) |
| 8 | [phase-08-polish.md](phase-08-polish.md) | branding, empty/error/loading states, a11y, Lighthouse, README/attribution | all prior |

**Critical path:** 3 → 4 → 6. Phases 5 and 7 branch off 3 and can run parallel to 4 (different files/tables). Phase 6 joins 4+5. Phase 8 last.

**Parallelizable after Phase 3 lands:** 4 (billing tables/UI), 5 (imaging — separate bucket + `checkup_images` table + `/checkups/[id]/images`), 7 (reminders — QStash route + cron, reads `checkups`). No file/table overlap among 4/5/7. Coordinate only on `checkups` reads (read-only from 4/5/7) and migration timestamp ordering.

## Established pattern (every slice follows — locked in Phase 2)

Migration (schema-qualified `bsk.*`, `GENERATED ALWAYS AS IDENTITY` PK, soft-delete `deleted boolean`, `created_at timestamptz`, RLS enabled **same migration** via `DO $$ ... IF NOT EXISTS pg_policies ...` guards gating on `bsk.current_role()`, `GRANT SELECT,INSERT,UPDATE` — **no DELETE**) → hand-written types in `types/supabase-bsk.ts` → Zod schema `lib/<feature>/<feature>-schema.ts` (no `'use server'`, shared client/server) → Server Actions (`"use server"`; `getServerSession` role check = defense-in-depth; RLS-as-gate on **user client** for role-gated writes, **admin client** only for privileged/system writes; `supabase.rpc("log_audit", {p_action, p_entity, p_entity_id})`; `revalidatePath(\`/${locale}/...\`)`; `redirect()` on success **outside** try/catch) → RSC list page (header `// WARNING: Do NOT add 'use cache'`; `getTranslations`; `createSupabaseServerClient`) + client form (RHF + `useActionState`, `FormState` union) → `ROLE_MENU` nav entry + `messages/{vi,en}.json` keys → validate `pnpm typecheck && pnpm lint && pnpm build`.

Reference implementations to mirror: `supabase/migrations/20260725112500_bsk_patients.sql` (RPC + RLS), `app/[locale]/(app)/patients/{actions.ts,patient-form.tsx,page.tsx}`, `lib/customers/*`, `lib/auth/require-role.ts` (route-group gate).

## Cross-cutting decisions (apply to all phases)

1. **Realtime channel naming** — always prefix `bsk:` (project-shared infra, PLAN §2.3). Queue channel: `bsk:queue:{shift_id}` (or `bsk:queue:{yyyy-mm-dd}` — see Phase 3 DECISION). Subscribe in Client Components only, never inside `'use cache'`; initial snapshot from RSC, deltas from channel.
2. **Money** — store as `integer` VND (đồng, no decimals; original used integer costs). Never float. Totals computed server-side and persisted; never trust client sums.
3. **Soft-delete everywhere** — `deleted boolean`, no DELETE grant. Historical checkups must keep valid FK references (doctor, medicine, service).
4. **Audit** — every clinical/financial mutation calls `log_audit`. Action naming: `<entity>.<verb>` (`checkup.create`, `invoice.pay`, `image.upload`). Reads are NOT audited (audit report Q4 — writes only, confirmed by existing call sites).
5. **Timezone** — `Asia/Ho_Chi_Minh` constant + `date-fns-tz`. "Today's queue" = server-computed VN calendar day, not UTC. Queue counter and shift keyed by VN date.
6. **RLS role sets** — clinical = `admin,receptionist,doctor,nurse`; catalog writes (medicines/services/templates/doctors) = `admin`; billing pay = `admin,cashier`; reads = any enrolled (`current_role() IS NOT NULL`).
7. **Free-tier ceilings (PLAN §7)** — Supabase 500MB DB + 1GB storage (shared w/ sibling apps); Upstash 10k cmds/day; Vercel Hobby 4h CPU + 1M invocations/mo. Imaging (Phase 5) is dominant storage consumer → compression + 7-day retention non-negotiable. QStash cardinality bounded: one job per recheckup, never per-minute polling.
8. **Next.js 16** — async `params`/`searchParams` (always `await`); server client created outside `'use cache'`; `proxy.ts` not `middleware.ts`; Turbopack build in CI catches cache violations.

## Per-phase acceptance (summary; detail in each file)

- **P3:** receptionist registers patient → checkup created in today's queue → doctor sees realtime queue → calls patient (waiting→in_progress) → fills vitals+diagnosis → marks done. Queue counter set/get works. Patient history view lists past checkups DESC. Vitest: queue-number assignment; Playwright: receptionist→doctor handoff.
- **P4:** admin manages medicines+services catalogs. Doctor composes prescription (search meds, dosage/qty, autosum) + assigns services. Invoice shows meds+services grand total. Cashier marks paid + records method. Vitest: invoice math.
- **P5:** per-checkup gallery; webcam capture + upload (≤200KB compressed); batch sync; delete; barcode/QR client-side; signed URLs (1h TTL). Retention sweep deletes >7-day objects.
- **P6:** PDF invoice/prescription/ultrasound render server-side from checkup data; Excel export (visits, revenue); dashboard (today queue size, completed count, revenue trend).
- **P7:** QStash schedules 24h-before recheckup reminder on remind_date set; recheckup-due list; nightly cron cleanup; reminder delivered via chosen channel.
- **P8:** branding settings; empty/error/loading states on every list; Lighthouse ≥90; README walkthrough + NOTICE/ATTRIBUTIONS verified.

## Test matrix (cross-phase)

| Layer | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 |
|---|---|---|---|---|---|
| Unit (Vitest) | queue# assignment, status transitions, VN-day boundary | invoice/order-item math, autosum | compression size guard, path builder | PDF total math, Excel row shape | reminder date calc (24h-before, VN tz) |
| Integration (Server Action + Zod) | checkup CRUD RLS gates | order/service RLS + pay gate | signed-URL issuance, RLS on bucket | export RLS | QStash signature verify |
| E2E (Playwright) | receptionist→doctor handoff, realtime update | prescribe→invoice→pay | capture→gallery→delete | print preview renders | (cron/QStash mocked) |

## Non-goals (PLAN §6 — do not build)

Data migration from SQLite; USB ultrasound capture (webcam only); native printer drivers (browser print + PDF only); HIPAA/GDPR; multi-tenant; chat (`SimpleMessageRequest`); emergency alerts (`EmergencyRequest`). Google Drive → replaced by Supabase Storage.

## Unresolved questions (block implementation until answered)

1. **[P3] Realtime channel shape** — per-shift (`bsk:queue:{shift_id}`) or per-day (`bsk:queue:{vn-date}`)? Determines shift model granularity. Default proposal: per-day channel, shift as a row column (simpler; clinic has 1-2 shifts/day).
2. **[P3] Shift model** — is a "shift" a fixed enum (morning/afternoon/evening) or admin-configurable `shifts` table with time ranges? Original had free `shift` field. Default: small fixed enum + optional label; skip a full shifts table unless configurability is required (YAGNI).
3. **[P3] Optimistic status UI** — use `useOptimistic` for call-patient/done transitions, or rely on realtime round-trip only? Default: optimistic for the acting user; realtime reconciles others. Confirm acceptable to show optimistic state before server ack.
4. **[P3] Checkup status enum values** — original: "CHỜ KHÁM"/"ĐÃ KHÁM". Propose `waiting | in_progress | done | cancelled`. Confirm set (esp. whether `cancelled` and a `paid`-adjacent state are needed, or payment lives only on `medicine_orders`).
5. **[P4] Payment** — manual entry only (record method: cash/transfer), or integrate a gateway (VNPay/Momo/Stripe)? PLAN implies manual. Default: manual only; gateway is a documented future path. **Confirm** — changes `medicine_orders` schema + a payments route.
6. **[P4] Invoice scope** — one invoice per checkup covering meds+services, or separate medicine-order vs service-order invoices (original had distinct `MedicineOrder` + `CheckupService`)? Default: one logical invoice view aggregating both; persist as separate tables (mirrors original), aggregate at read.
7. **[P5] Barcode/QR content** — what does the code encode? patient CCCD, checkup id, or a signed lookup token? Default: checkup id (opaque). Confirm — affects privacy (don't encode CCCD in a printable barcode).
8. **[P5] Retention exemption** — 7-day sweep deletes ALL checkup media. Any images that must persist (e.g. a finalized ultrasound attached to a printed report)? Default: sweep all (educational data). Confirm no clinical-record retention requirement conflicts.
9. **[P6] Print CSS / paper** — PDF page size (A4 vs A5 vs thermal receipt for invoice), margins, header/footer, VN font embedding (diacritics need a Unicode font in @react-pdf). Default: A5 invoice, A4 ultrasound report; embed a Vietnamese-capable font. Confirm paper sizes match clinic printers.
10. **[P6] Excel export scope** — which datasets + who can export (admin only, or cashier for revenue)? Default: admin-only; visit history + monthly revenue.
11. **[P7] Reminder channel** — email (Resend), SMS, or in-app only? PLAN says email optional, SMS deferred. Default: in-app recheckup-due list is the baseline (no external send); Resend email behind a flag. **Confirm** — SMS requires a provider + cost.
12. **[P7] Reminder trigger** — QStash scheduled per-checkup at remind_date-24h, vs a single daily cron scanning due rows? Cardinality: per-checkup QStash respects 10k/day easily but leaves orphan jobs if remind_date changes; daily cron is simpler + bounded. Default: daily Vercel cron scans due window (KISS, bounded); QStash only if precise timing needed.
13. **[general] De-drop chat/emergency?** — audit Q1 flags `SimpleMessageRequest`/`EmergencyRequest`. Currently non-goals. Confirm they stay dropped (default: yes).
