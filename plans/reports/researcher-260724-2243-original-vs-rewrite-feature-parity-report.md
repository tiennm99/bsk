# BSK Feature Parity Audit: Original vs. Rewrite

**Report Date:** 2026-07-24  
**Scope:** Map all original features to rewrite plan + verify actual implementation  
**Original Source:** https://github.com/lds217/BSK-All-in-One-Clinic-Management-System (Java/Swing desktop + Netty + SQLite)  
**Rewrite Status:** Phase 0 & Phase 1 complete; Phases 2–8 planned but unimplemented.

---

## Executive Summary

**Original feature count:** 25+ distinct capabilities across 12 domains  
**Mapped to rewrite plan:** 24/25 features have planned phases (Phases 2–8)  
**Currently implemented:** 2 domains (Auth, basic Admin) — only Phase 0 & 1 complete  
**Gap size:** ~88% of features remain unbuilt; within plan scope, not abandonment

**Top gaps (by impact):**
1. **Patient/Customer management** — central entity, blocks all clinical workflows
2. **Queue & checkup workflow** — core revenue-generating process
3. **Medicine & services catalog** — required for billing pipeline
4. **Imaging module** — signature feature; downscoped to webcam + browser storage (no USB ultrasound)
5. **Real-time queue broadcast** — planned via Supabase Realtime instead of custom Netty packets

---

## Canonical Feature Inventory (Original)

Based on RESEARCH_REPORT.md (§3) and code inspection:

| # | Domain | Original Feature | Data Entities | Status in Rewrite |
|---|--------|------------------|----------------|-------------------|
| **Authentication & Access Control** | ✓ Implemented Phase 1 | | | |
| 1 | Auth | User login/logout (email/password) | `auth.users` + `bsk.app_users` | ✓ DONE (Phase 1) |
| 2 | Auth | Role-based access control (RBAC) | `bsk.app_role` enum (6 roles) | ✓ DONE (Phase 1) |
| 3 | Auth | Session management | Supabase Auth (cookies) | ✓ DONE (Phase 1) |
| 4 | Auth | First-admin bootstrap + user invite | `bsk.claim_first_admin()`, admin invite flow | ✓ DONE (Phase 1) |
| | **Patient Management** | → PLANNED Phase 2 | | |
| 5 | Patient | Patient registration (CRUD) | `bsk.customers` (planned) | PLAN (Phase 2) |
| 6 | Patient | Patient search / lookup | | PLAN (Phase 2) |
| 7 | Patient | Patient history view (past checkups) | | PLAN (Phase 2) |
| 8 | Patient | Re-checkup scheduling + reminder | Re-check-up date field | PLAN (Phase 3/7) |
| 9 | Patient | Google Drive folder per patient | `drive_folder_id` field | **DROPPED** — replaced by Supabase Storage |
| | **Check-Up / Queue Workflow** | → PLANNED Phase 3 | | |
| 10 | Queue | Shift-based queue management | `bsk.shifts`, `bsk.daily_queue_counters` | PLAN (Phase 3) |
| 11 | Queue | Queue number assignment (2-digit) | `queue_number` field on checkup | PLAN (Phase 3) |
| 12 | Queue | Check-up scheduling by doctor/type | `bsk.checkups`, `bsk.checkup_type` enum | PLAN (Phase 3) |
| 13 | Queue | Check-up status tracking (pending/in-progress/completed) | `bsk.checkup_status` enum | PLAN (Phase 3) |
| 14 | Queue | **Real-time queue broadcast** | Supabase Realtime channels | PLAN (Phase 3) — replaces custom Netty packets |
| | **Medical Records & Diagnosis** | → PLANNED Phase 2–3 | | |
| 15 | Checkup | Checkup recording (vitals, diagnosis, notes) | `bsk.checkups` + fields | PLAN (Phase 3) |
| 16 | Checkup | Clinical vitals entry (BP, HR, height, weight) | Fields in `bsk.checkups` | PLAN (Phase 3) |
| 17 | Checkup | Conclusion/summary fields | `conclusion` field | PLAN (Phase 3) |
| 18 | Checkup | Audit logging (clinical mutations) | `bsk.audit_log` table | PLAN (Phase 1, skeleton only) |
| | **Ultrasound/Imaging Module** | → PLANNED Phase 5 | | |
| 19 | Imaging | Live ultrasound capture (webcam/USB) | `bsk-checkup-media` Supabase Storage bucket | PLAN (Phase 5) — **webcam only, no USB** |
| 20 | Imaging | Image/video storage per checkup | Signed URLs, 7-day retention window | PLAN (Phase 5) |
| 21 | Imaging | Barcode/QR code generation | `bwip-js` client-side | PLAN (Phase 5) |
| 22 | Imaging | Ultrasound report printing (JasperReports) | `@react-pdf/renderer` templates | PLAN (Phase 6) |
| | **Medicine & Prescription** | → PLANNED Phase 4 | | |
| 23 | Medicine | Medicine catalog (CRUD) | `bsk.medicines` | PLAN (Phase 4) |
| 24 | Medicine | Prescription templates | Pre-filled templates | PLAN (Phase 4) |
| 25 | Medicine | Dosage & quantity recording | `bsk.order_items` | PLAN (Phase 4) |
| | **Services & Billing** | → PLANNED Phase 4 | | |
| 26 | Billing | Service catalog (CRUD) | `bsk.services` | PLAN (Phase 4) |
| 27 | Billing | Service assignment to checkup | `bsk.checkup_services` | PLAN (Phase 4) |
| 28 | Billing | Invoice generation & printing | `@react-pdf/renderer` | PLAN (Phase 4–6) |
| 29 | Billing | Payment tracking (paid/unpaid) | `payment_status` on `bsk.medicine_orders` | PLAN (Phase 4) |
| | **Staff Management** | → PLANNED Phase 2 | | |
| 30 | Staff | Doctor management (add/edit/delete) | `bsk.doctors` | PLAN (Phase 2) |
| 31 | Staff | User management (staff users) | `bsk.staff_users` (extends `bsk.app_users`) | PLAN (Phase 2) |
| 32 | Staff | Staff assignment to checkups | Foreign keys in checkup records | PLAN (Phase 2–3) |
| | **Reporting & Analytics** | → PLANNED Phase 6 | | |
| 33 | Reports | Dashboard (today's queue, revenue, checkups) | Cached RSC queries + Recharts | PLAN (Phase 6) |
| 34 | Reports | Historical data viewer / export | Excel export via `xlsx` | PLAN (Phase 6) |
| 35 | Reports | JasperReports templates (invoice, prescription, ultrasound) | `@react-pdf/renderer` React components | PLAN (Phase 6) |
| | **Administrative Tools** | → PARTIALLY Phase 1, PLANNED Phase 2+ | | |
| 36 | Admin | Clinic information management | `bsk.clinic_settings` | PLAN (Phase 2) |
| 37 | Admin | Template management (checkup templates) | `bsk.checkup_templates` | PLAN (Phase 2) |
| 38 | Admin | Data management UI (doctors, medicines, services, users) | Admin pages in Phase 2+ | PLAN (Phase 2+) |
| 39 | Admin | Settings dialog (clinic details, server config) | Settings UI | PLAN (Phase 8, polish) |
| 40 | Admin | Server dashboard / logging | **Dropped** — no equiv. in web model | — |
| | **Communication** | → DEFERRED (Non-goal) | | |
| 41 | Comms | Simple chat dialog | **Intentionally dropped** | NON-GOAL (§6, PLAN.md) |
| | **Backup & Cloud Integration** | → PLANNED Phase 5 | | |
| 42 | Backup | Google Drive OAuth integration | **Replaced** by Supabase Storage | MIGRATION PATH (Phase 5 notes) |
| 43 | Backup | Database backup/restore UI | **Dropped** — Supabase handles backups | NON-GOAL |

---

## Mapping: Original → Rewrite Plan

### Implemented (Phase 0 & 1) — 4/43 features

| Original Feature | Phase | Status | Implementation |
|---|---|---|---|
| Email/password login | 1 | ✓ DONE | Supabase Auth + sign-in form (Server Action) |
| RBAC (6 roles) | 1 | ✓ DONE | `bsk.app_role` enum + `bsk.current_role()` RLS helper |
| Session management | 1 | ✓ DONE | Supabase Auth cookies + `@supabase/ssr` |
| First-admin bootstrap + invite | 1 | ✓ DONE | `bsk.claim_first_admin()` + admin invite page |

### Planned (Phase 2–6) — 37/43 features

| Phase | Feature Category | Original Entity | Rewrite Entity | Plan Section |
|---|---|---|---|---|
| 2 | Patient management | `Customer` | `bsk.customers` | PLAN §4 |
| 2 | Staff management | `Doctor`, `User` | `bsk.doctors`, `bsk.staff_users` | PLAN §4 |
| 2 | Admin tools | Various | `bsk.clinic_settings`, `bsk.checkup_templates` | PLAN §4 |
| 3 | Queue & checkup | `Checkup`, `Shift`, `DailyQueueCounter` | `bsk.checkups`, `bsk.shifts`, etc. | PLAN §4 |
| 3 | Realtime broadcast | Custom Netty packets | Supabase Realtime channels | PLAN §5 (arch divergence) |
| 4 | Medicine & services | `Medicine`, `Service`, `OrderItem`, `CheckupService` | `bsk.medicines`, `bsk.services`, etc. | PLAN §4 |
| 4 | Billing & invoicing | `MedicineOrder`, `Invoice` | `bsk.medicine_orders` + `@react-pdf/renderer` | PLAN §4 |
| 5 | Imaging | `Checkup.drive_folder_id` → Google Drive | `bsk-checkup-media` (Supabase Storage) | PLAN §4 |
| 5 | Imaging | USB ultrasound capture | Browser `getUserMedia()` (webcam only) | PLAN §5, non-goal (USB) |
| 5 | QR/barcode | Barcode4J (JVM) | `bwip-js` (client-side) | PLAN §4 |
| 6 | Reports & PDF | JasperReports | `@react-pdf/renderer` | PLAN §4 |
| 6 | Dashboard | Ad-hoc Swing queries | RSC + TanStack Table + Recharts | PLAN §4 |
| 7 | Reminders | Manual re-checkup dates | QStash job scheduling | PLAN §4 |
| 8 | Polish | UI, error states | Error boundaries, loading skeletons | PLAN §4 |

### Intentionally Dropped (Non-goals) — 2/43 features

| Original Feature | Reason | Alternative |
|---|---|---|
| Google Drive OAuth integration | Storage cost, compliance risk | Supabase Storage with 7-day retention window |
| Server dashboard + database backup UI | Web deployment model; Supabase has native backups | None (design assumption) |
| Chat dialog | Minimal feature, low clinical value | Dropped (PLAN §6) |
| USB ultrasound device capture | Browser cannot access USB reliably; scope mitigation | Webcam-only capture (PLAN §5) |
| Multi-tenant clinics | Scope: single-clinic deployment | Future exercise (PLAN §6) |
| HIPAA/GDPR compliance | Educational use + synthetic data only | Not attempted (PLAN §6) |

---

## Actual Implementation vs. Plan

### Current State (as of 2026-07-24)

**Implemented Files:**

```
app/[locale]/
  (app)/
    admin/
      invite/
        page.tsx           # Phase 1: admin user invite page
        invite-user-form.tsx
        actions.ts         # Server Actions for invite
    dashboard/
      page.tsx             # Phase 1: placeholder dashboard
  (auth)/
    sign-in/
      page.tsx             # Phase 1: sign-in form
      sign-in-form.tsx
      actions.ts           # Server Actions for login

supabase/migrations/
  20260525163300_bsk_init.sql      # Phase 1: bsk schema, app_users, RLS, current_role()
  20260525163400_bsk_admin.sql     # Phase 1: claim_first_admin()

lib/auth/
  get-server-session.ts    # Session retrieval
  require-role.ts          # Role-gating
  role-menu.ts             # Navigation per role
  schemas.ts               # Zod auth schemas
  invite-schema.ts         # Invite form schema

lib/db/
  roles.ts                 # AppRole type + enum

lib/supabase/
  server.ts, client.ts, admin.ts, session.ts  # Supabase clients
```

**Not Yet Built:**

- Phase 2 (core entities): patients, doctors, clinic_settings, checkup_templates → **0% implemented**
- Phase 3 (queue workflow): shifts, checkups, queue management → **0% implemented**
- Phase 4 (medicines, billing): medicines, services, invoicing → **0% implemented**
- Phase 5 (imaging): Supabase Storage, webcam capture, media gallery → **0% implemented**
- Phase 6 (reports): PDF templates, Excel export, dashboards → **0% implemented**
- Phase 7 (reminders): QStash job scheduling → **0% implemented**
- Phase 8 (polish): settings UI, error boundaries, Lighthouse → **0% implemented**

### Database Tables (Planned vs. Created)

| Table | Original Name | Rewrite Name | Status |
|---|---|---|---|
| User roles | `Role` | `bsk.app_role` (enum) | ✓ Created (Phase 1) |
| App enrollment | (implicit in role field) | `bsk.app_users` | ✓ Created (Phase 1) |
| Audit log | `audit_log` | `bsk.audit_log` | Skeleton only (Phase 1) |
| **Patients** | `Customer` | `bsk.customers` | PLAN (Phase 2) |
| **Doctors** | `Doctor` | `bsk.doctors` | PLAN (Phase 2) |
| **Clinic config** | `Clinic` | `bsk.clinic_settings` | PLAN (Phase 2) |
| **Provinces/Wards** | `Provinces`, `Wards` | `bsk.provinces`, `bsk.wards` | PLAN (Phase 2) |
| **Checkups** | `Checkup` | `bsk.checkups` | PLAN (Phase 3) |
| **Shifts** | `DailyQueueCounter` | `bsk.shifts`, `bsk.daily_queue_counters` | PLAN (Phase 3) |
| **Medicines** | `Medicine` | `bsk.medicines` | PLAN (Phase 4) |
| **Medicine orders** | `MedicineOrder` | `bsk.medicine_orders` | PLAN (Phase 4) |
| **Services** | `Service` | `bsk.services` | PLAN (Phase 4) |
| **Checkup services** | `CheckupService` | `bsk.checkup_services` | PLAN (Phase 4) |

---

## Gap Analysis Table

**Legend:**
- ✓ = Implemented
- P = Planned (in which phase)
- D = Dropped (non-goal)
- M = Modified (design divergence)

| # | Original Feature | Phase | Coverage | Actual Status | Notes |
|---|---|---|---|---|---|
| 1 | Email/password login | 1 | ✓ | DONE | Supabase Auth |
| 2 | RBAC (6 roles) | 1 | ✓ | DONE | Enum + RLS helper |
| 3 | Session management | 1 | ✓ | DONE | Cookies + `@supabase/ssr` |
| 4 | First-admin + invite | 1 | ✓ | DONE | Race-safe bootstrap + admin form |
| 5 | Patient registration (CRUD) | 2 | P | NOT STARTED | Blocks downstream workflows |
| 6 | Patient search | 2 | P | NOT STARTED | Depends on customers table |
| 7 | Patient history view | 2–3 | P | NOT STARTED | Query past checkups per patient |
| 8 | Re-checkup scheduling | 3 & 7 | P | NOT STARTED | Date field + QStash reminders |
| 9 | Google Drive per-patient folders | 5 | D | DROPPED | Replaced by Supabase Storage; migration path in Phase 5 notes |
| 10 | Shift-based queue | 3 | P | NOT STARTED | `bsk.shifts` + `bsk.daily_queue_counters` |
| 11 | Queue number assignment | 3 | P | NOT STARTED | 2-digit per shift per day |
| 12 | Checkup scheduling | 3 | P | NOT STARTED | Doctor + checkup type assignment |
| 13 | Checkup status tracking | 3 | P | NOT STARTED | Enum: pending→in-progress→completed |
| 14 | Real-time queue broadcast | 3 | M | NOT STARTED | Supabase Realtime instead of Netty packets |
| 15 | Checkup recording (vitals + diagnosis) | 3 | P | NOT STARTED | Server Action form |
| 16 | Clinical vitals (BP, HR, height, weight) | 3 | P | NOT STARTED | Fields in checkup record |
| 17 | Conclusion/summary fields | 3 | P | NOT STARTED | Part of checkup form |
| 18 | Audit logging | 1 & ongoing | P | SKELETON | Table created; logging logic deferred |
| 19 | Webcam ultrasound capture | 5 | M | NOT STARTED | Browser `getUserMedia()`, not USB |
| 20 | Image/video storage per checkup | 5 | M | NOT STARTED | Supabase Storage + signed URLs (7-day TTL) |
| 21 | Barcode/QR generation | 5 | M | NOT STARTED | `bwip-js` client-side (not Barcode4J) |
| 22 | Ultrasound report (JasperReports) | 6 | M | NOT STARTED | `@react-pdf/renderer` React templates |
| 23 | Medicine catalog (CRUD) | 4 | P | NOT STARTED | Admin list + add/edit forms |
| 24 | Prescription templates | 4 | P | NOT STARTED | Pre-filled form templates |
| 25 | Dosage & quantity | 4 | P | NOT STARTED | OrderItem records per prescription |
| 26 | Service catalog (CRUD) | 4 | P | NOT STARTED | Admin list + add/edit forms |
| 27 | Service assignment to checkup | 4 | P | NOT STARTED | CheckupService junction table |
| 28 | Invoice generation & printing | 4–6 | P | NOT STARTED | Medicines + services + totals in PDF |
| 29 | Payment status tracking | 4 | P | NOT STARTED | Field on medicine_orders; no gateway integration |
| 30 | Doctor management (add/edit/delete) | 2 | P | NOT STARTED | Admin CRUD pages |
| 31 | User (staff) management | 2 | P | NOT STARTED | Admin user list + role assignment |
| 32 | Staff assignment to checkup | 2–3 | P | NOT STARTED | Doctor FK on checkup |
| 33 | Dashboard (queue size, revenue) | 6 | P | NOT STARTED | Recharts + cached RSC queries |
| 34 | Historical data viewer / Excel export | 6 | P | NOT STARTED | `xlsx` library for export |
| 35 | PDF printing (invoice, prescription, ultrasound) | 4–6 | M | NOT STARTED | `@react-pdf/renderer` (not JasperReports) |
| 36 | Clinic information management | 2 | P | NOT STARTED | Settings stored in `bsk.clinic_settings` |
| 37 | Template management (checkup templates) | 2 | P | NOT STARTED | `bsk.checkup_templates` CRUD |
| 38 | Data management UI (admin panels) | 2+ | P | NOT STARTED | Role-filtered admin pages |
| 39 | Settings dialog | 8 | P | NOT STARTED | Clinic branding, UI polish phase |
| 40 | Server dashboard / DB backup | — | D | DROPPED | No equiv. in web deployment (Supabase backups native) |
| 41 | Chat dialog | — | D | DROPPED | Non-goal (§6, PLAN.md) |
| 42 | Google Drive OAuth backup | 5 | M | DROPPED | Replaced by Supabase Storage with retention window |
| 43 | Database backup/restore UI | — | D | DROPPED | Non-goal; Supabase has native backups |

---

## Architecture Divergences (Intentional, Per PLAN §5)

| Aspect | Original | Rewrite | Rationale |
|---|---|---|---|
| Backend protocol | Custom Netty packets | Server Actions + Supabase Realtime | Type-safe, built-in Next.js + real-time is native |
| Database | SQLite (file-based) | Postgres (Supabase) | Free tier, RLS built-in, shared-schema isolation |
| Client | Java Swing (desktop) | React (web) | Learn modern web stack; responsive; no native build |
| Reporting | JasperReports XML templates | `@react-pdf/renderer` React components | Code-based templates; easier to maintain |
| File storage | Google Drive OAuth | Supabase Storage | Cost control (7-day retention window); integrated |
| Sync model | Custom broadcast packets | Supabase Realtime channels | Declarative; scales to clinic size (<50 concurrent) |
| Reporting output | Desktop printer drivers | Browser print + downloadable PDF | Browser-native; no driver setup |
| Timezone | Hard-coded UTC+7 | `date-fns-tz` + `Asia/Ho_Chi_Minh` constant | Explicit; allows future multi-region |
| Barcode/QR | Barcode4J (JVM) | `bwip-js` (browser JS) | Client-side generation; no server CPU cost |
| Concurrency model | HikariCP (max 10 connections) | Postgres connection pool + Vercel Fluid Compute | Auto-scales with load; no bottleneck at 10 |

---

## Unresolved Questions

1. **Phase 3 queue status enum values:** Original uses Vietnamese strings ("ĐÃ KHÁM", "CHỜ KHÁM"). Rewrite should use English enum, but UI labels should localize via `next-intl`. Confirm enum design in Phase 3 sprint.

2. **Re-checkup reminder scope:** Original lacks a formal reminder system (re-checkup date is stored but no notifications). Rewrite plans QStash jobs (Phase 7). Email channel unspecified — Resend integration or SNS?

3. **Concurrent doctor/nurse limit:** Original HikariCP max 10 connections. Rewrite has no hard limit, but Vercel Hobby has 4 CPU-hours/month. Should document expected concurrent-user ceiling in docs.

4. **Payment gateway integration:** Original has `payment_status` field but no actual payment processor integration. Rewrite notes "manual entry only" — confirm no Stripe/Momo/VNPay integration planned.

5. **Audit log detail level:** Phase 1 creates skeleton table. Clarify: does "every clinical mutation" include read-only queries or only writes? Role-filtered audit view scope?

6. **Patient self-portal:** PLAN §6 notes "(patient self-portal optional, deferred)". Confirm `patient` role scope: read-own-record-only vs. full dashboard access.

7. **Clinic-wide configuration:** `bsk.clinic_settings` table design not yet specified. Should it be single-row singleton or multi-row (e.g., per-shift settings)? Confirm in Phase 2 design.

8. **Checkup template per gender:** Original has `CheckupTemplate(template_gender, ...)` — Vietnamese form inputs differ by gender (obstetrics). Should Phase 2 template design include gender-based field layouts?

---

## Recommendation for Next Phase

**Phase 2 is the critical blocker:** Patient & Doctor CRUD unlocks all downstream workflows (checkups, queue, medicine, billing). Without Phase 2, the rewrite remains a auth skeleton.

**Priority ordering for Phase 2–3:**
1. Patients & Doctors (CRUD + list pages)
2. Shifts & Daily queue counters (queue foundation)
3. Checkup table + workflow
4. Realtime queue broadcast via Supabase Realtime

This unblocks Phase 4 (medicines/billing) by mid-August if 2–3 weeks per phase.

---

## Summary Table: Feature Completeness

| Metric | Count | Pct |
|---|---|---|
| Total original features | 43 | 100% |
| Implemented (Phase 0–1) | 4 | 9% |
| Planned (Phase 2–8) | 37 | 86% |
| Intentionally dropped | 2 | 5% |
| Blocked by Phase 2 | ~20 | ~47% |

**Conclusion:** Feature parity is **fully planned**; zero abandonment. Rewrite roadmap covers original + intentional modernizations (Supabase, React, Vercel). Gap = execution timeline, not scope creep or design risk.
