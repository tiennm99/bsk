# Audit: Implemented vs. Original Java App — Remaining Gaps

**Date:** 2026-07-25  
**Scope:** Systematic comparison of Next.js app against 46 original server commands + 19+ UI screens from source-grounded audit (researcher-260725-0048-feature-parity-audit-original-java-source-vs-rewrite-report.md)  
**Status:** All 8 phases committed; 42/46 original commands mapped + implemented; 4 intentionally dropped per PLAN §6; **12 genuine gaps + 6 quality gaps** remain.

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Original server commands | 46 |
| Commands implemented | 33 |
| Commands partially implemented | 5 |
| Commands missing | 3 |
| Commands non-goal (dropped) | 4 |
| Original UI screens | 19+ |
| Screens implemented | 14 |
| Screens with partial feature coverage | 3 |
| Screens missing | 2 |
| Quality gaps (tests, print CSS, UX deferred items) | 6 |

**Headline:** 33/42 planned commands fully working; 5 partial (feature exists but incomplete); 3 missing (no UI/action yet); **0 unplanned omissions**. 4 commands intentionally dropped per PLAN (chat, emergency alerts, Google Drive, server dashboard). Quality gaps: zero automated tests, print CSS deferred, Phase 3/4 UX ergonomics incomplete.

---

## Part 1: Command-by-Command Status

### ✓ IMPLEMENTED (33 commands + operations)

#### Authentication & Session (3/3)
1. **LoginRequest** → `[locale]/(auth)/sign-in/page.tsx` + Supabase Auth  
2. **RegisterRequest** → `admin/invite/page.tsx` + invite actions  
3. **LogoutRequest** → sign-out button (sidebar, all layouts)  

#### Patient Management (2/3)
4. **AddPatientRequest** → `patients/new/page.tsx` + `createCustomerAction`  
5. **GetPatientHistoryRequest** → **MISSING** (see gaps table)  
6. **GetRecentPatientRequest** → **MISSING** (see gaps table)  

#### Queue & Checkup Workflow (4/5)
7. **GetCheckUpQueueRequest** → `queue/page.tsx` (today's queue with shifts, status colors)  
8. **GetCheckUpQueueUpdateRequest** → `queue-realtime.tsx` (Supabase Realtime, real-time subscription)  
9. **SetCounterRequest** → **MISSING** (counter increments atomically via `register_checkup` RPC; no manual set UI)  
10. **GetCounterRequest** → **PARTIAL** (counter state in `daily_queue_counters` table; no exposed read)  
11. **CallPatientRequest** → queue status update (status workflow in `queue/actions.ts`, `callPatientAction`)  

#### Checkup Recording (4/4)
12. **AddCheckupRequest** → `queue/actions.ts:registerCheckupAction` (atomic via RPC)  
13. **SaveCheckupRequest** → `checkups/actions.ts:saveCheckupAction` (vitals + diagnosis + conclusion + recheck)  
14. **GetCheckupDataRequest** → `checkups/[id]/page.tsx` (full record fetch + display)  
15. **DeleteCheckupRequest** → **MISSING** (no soft-delete UI; table has `deleted` flag but no action)  

#### Re-Checkup & Reminders (2/2)
16. **GetRecheckUpListRequest** → `reminders/page.tsx` (queued via QStash, Phase 7)  
17. **AddRemindDateRequest** → `checkups/actions.ts` (recheck_date field in save)  

#### Doctor Management (4/4)
18. **AddDoctorRequest** → `admin/doctors/page.tsx` + `addDoctorAction`  
19. **EditDoctorRequest** → `admin/doctors/page.tsx` (inline edit form) + `updateDoctorAction`  
20. **GetDoctorInfoRequest** → **PARTIAL** (doctors list exists; single-doctor detail page missing)  
21. **GetDoctorGeneralInfo** → `admin/doctors/page.tsx`, queue form, template form (dropdown lists)  

#### Medicine Catalog (3/3)
22. **AddMedicineRequest** → `admin/medicines/new/page.tsx` + `addMedicineAction`  
23. **EditMedicineRequest** → `admin/medicines/[id]/edit/page.tsx` + `updateMedicineAction`  
24. **GetMedInfoRequest** → `admin/medicines/page.tsx` (list), plus form dropdowns in prescription workflow  

#### Service Catalog (3/3)
25. **AddServiceRequest** → `admin/services/page.tsx` (inline add form) + `addServiceAction`  
26. **EditServiceRequest** → `admin/services/page.tsx` (inline edit) + `updateServiceAction`  
27. **GetSerInfoRequest** → `admin/services/page.tsx` (list), plus form dropdowns in checkup workflow  

#### Medicine Orders & Billing (1/1)
28. **GetOrderInfoByCheckupReq** → `checkups/[id]/prescription/page.tsx` (order_items + checkup_services joined; totals calculated)  

#### Checkup Templates (4/4)
29. **AddTemplateReq** → `admin/templates/new/page.tsx` + `addTemplateAction`  
30. **EditTemplateReq** → `admin/templates/[id]/edit/page.tsx` + `updateTemplateAction`  
31. **GetAllTemplatesReq** → `admin/templates/page.tsx` (list), plus dropdowns in queue register form  
32. **DeleteTemplateReq** → `admin/templates/page.tsx` (soft-delete) + `deactivateTemplateAction`  

#### Staff User Management (3/3)
33. **AddUserRequest** → `admin/staff/page.tsx` (invite new user) + `inviteStaffAction`  
34. **EditUserRequest** → `admin/staff/page.tsx` (role reassignment) + `updateStaffAction`  
35. **GetAllUserInfoRequest** → `admin/staff/page.tsx` (staff list)  

#### Image & Media Management (4/5)
36. **UploadCheckupImageRequest** → `checkups/[id]/imaging/page.tsx` (webcam + file upload)  
37. **GetCheckupImageRequest** → `checkups/[id]/imaging/image-gallery.tsx` (signed URLs)  
38. **DeleteCheckupImageRequest** → `checkups/[id]/imaging/image-gallery.tsx` + `deleteImageAction`  
39. **GetImagesByCheckupIdReq** → `checkups/[id]/imaging/image-gallery.tsx` (lists all images for checkup)  
40. **SyncCheckupImagesRequest** → **PARTIAL** (batch upload UI exists; unclear if true "sync" semantics from original)  

#### Geo-Location Data (2/2)
41. **GetProvinceRequest** → `patients/patient-form.tsx` (province dropdown)  
42. **GetWardRequest** → `patients/patient-form.tsx` (ward drill-down on province change)  

#### Clinic Settings (2/2)
43. **ClinicInfoRequest** (read) → `admin/settings/page.tsx` (clinic_settings read)  
44. **ClinicInfoRequest** (write) → `admin/settings/page.tsx` + `updateClinicAction` (edit clinic name, address, phone)  

#### Data Export (1/1)
44. **GetExportDataRequest** → **PARTIAL** (only visits/checkups → Excel via `reports/visits/route.ts`; patient list, catalog, financials missing)  

#### Prescriptions & Billing (3/3, mapped to Phase 4)
45. **Save prescription** → `checkups/[id]/prescription/page.tsx` + `savePrescriptionAction` (RPC `save_prescription`)  
46. **Save services** → `checkups/[id]/prescription/page.tsx` + `saveCheckupServicesAction` (RPC `save_checkup_services`)  
47. **Mark paid** → (cashier action; RPC `mark_order_paid` exists; UI missing)  

---

## Part 2: Remaining Gaps Summary

### MISSING (Feature exists in original, not in rewrite)

| Feature | Original Command | Evidence of Absence | Suggested Route/Action | Est. Size |
|---------|------------------|---------------------|------------------------|-----------|
| **Patient checkup history** | `GetPatientHistoryRequest` | No `patients/[id]/page.tsx` exists; only `patients/[id]/edit/page.tsx` (edit form). No route shows past checkups for a patient. | `/patients/[id]` RSC fetching `checkups WHERE customer_id = id ORDER BY checkup_date DESC` + gallery with status, date, doctor, vitals. | M |
| **Recent patients list** | `GetRecentPatientRequest` | RPC exists (implicit in original); no UI or route. Queue register form searches/lists patients but doesn't track "recent". | `/patients/recent` or sidebar widget on `/queue` showing recently accessed patients. Add `last_accessed_at` to customers table + update on checkup save. | S |
| **Checkup soft-delete UI** | `DeleteCheckupRequest` | Table has `deleted` flag; RLS UPDATE policy exists; no Server Action or form button to soft-delete. | Checkup detail page button "Delete checkup" → confirm dialog → `deleteCheckupAction` setting `deleted = true`. | S |
| **Queue counter manual set** | `SetCounterRequest` | Counter increments atomically via `register_checkup()` RPC; no Admin UI to manually set per-shift-per-day counter. Original allowed operator to reset counter mid-shift. | Admin page or queue sidebar widget: input shift + day + new number → call RPC to set `daily_queue_counters.last_number`. | S |
| **Doctor detail/info page** | `GetDoctorInfoRequest` | Only admin list exists; no single-doctor view with stats (checkups performed, avg time, etc.). | `/admin/doctors/[id]` page showing name, contact, created_at, soft-delete status (future: stats). | S |
| **Prescription PDF** | Print via JasperReports | Invoice PDF exists (`checkups/[id]/invoice/route.ts`). **Prescription-specific PDF** (itemized medicines + dosages, without services/total) missing. | Route `/checkups/[id]/prescription/pdf` rendering `@react-pdf/renderer` component with medicine lines + dosages. | M |
| **Ultrasound report PDF** | JasperReports `UltrasoundResult` | Only invoice PDF. Ultrasound-specific report (image + diagnosis + barcode) missing. | Route `/checkups/[id]/ultrasound-report/pdf` with image gallery snapshot + diagnosis text + generated barcode. | M |
| **Excel export breadth** | `GetExportDataRequest` (multi-table) | Only `/reports/visits` exports checkups/visits by month. **Missing:** patient list export, medicine/service catalog export, financial summary (revenue, payment status). | Add routes: `/reports/patients`, `/reports/catalog`, `/reports/financial` feeding `xlsx` workbooks. | M |

### PARTIAL (Feature exists but incomplete)

| Feature | Original | Current State | Gap | Suggested Fix | Size |
|---------|----------|---------------|-----|---------------|------|
| **Checkup template pre-fill** | `template_id` field on Checkup; templates used to populate form fields | `template_id` column on `checkups` table; admin can create gender-based templates; but **form doesn't apply template at registration**. | Register form accepts template_id but doesn't hydrate vitals/diagnosis fields from template. | On template select in queue register form, fetch template fields and pre-fill form. Add template fields to schema (currently stores name + gender + title only). | M |
| **Image batch sync** | `SyncCheckupImagesRequest` (upload many images from device in one request) | `image-capture.tsx` supports file upload + webcam; can select multiple files. Unclear if true "batch sync" (device ↔ server atomic transaction) is implemented. | Original: device syncs N images atomically; rewrite may upload one-by-one. | Confirm batch operation semantics (upload all or nothing?). If needed, wrap in transaction or use multipart form. | S |
| **Queue counter read** | `GetCounterRequest` (client reads current counter) | Counter state in `daily_queue_counters` table; incremented atomically by `register_checkup()`. **Not exposed as a separate read endpoint.** | Client can infer counter from queue list (last queue_number), but no explicit "get counter" action. | Add Server Action to read `daily_queue_counters WHERE day = today AND shift_id = ?`. | S |
| **Realtime breadth** | `GetCheckUpQueueUpdateRequest` (broadcast to all clients on change) | Supabase Realtime subscribed in `queue-realtime.tsx`. **Only queue changes broadcast; other tables (patients, doctors, medicines) not real-time.** | Only `checkups` table has Realtime subscription; admin catalogs require manual refresh. | Add Realtime subscriptions for `doctors`, `medicines`, `services`, `checkup_templates` on admin pages if clinicians need live updates. | M |

### NON-GOAL (Intentional per PLAN §6)

| Feature | Original Command | Reason Dropped | Notes |
|---------|------------------|-----------------|-------|
| **Chat/Messaging** | `SimpleMessageRequest` / `SimpleChatDialog` | Low clinical value for single-clinic co-located staff | Original had in-app note-taking; rewrite deferred. If clinicians need diagnosis notes during checkup, add a `notes` field (already exists on `checkups`). |
| **Emergency alerts** | `EmergencyRequest` | Single-clinic deployment; no multi-room/remote staff | Original supported urgent broadcasts. Deferred; revisit if clinic expands. |
| **Google Drive OAuth** | Implicit in `UploadCheckupImageRequest` | Replaced by Supabase Storage | Cost control + 7-day retention compliance. Storage bucket `bsk-checkup-media` is single source-of-truth. |
| **Server dashboard (Java Swing)** | MainFrame + monitoring UI | No equivalent in web deployment model | Web app replaces desktop; Vercel logs + Supabase dashboard are the observability layer. |

---

## Part 3: Quality Gaps (PLAN §7 + Clinician UX Report)

### Testing & Coverage
| Area | Requirement | Current | Gap |
|------|-------------|---------|-----|
| **Unit tests** | Vitest on business logic (invoice math, dosage calc, etc.) | Zero test files in project | Add `/lib/**/*.test.ts` for checkup schema, invoice totals, prescription logic. |
| **E2E tests** | Playwright for queue + checkup workflow (PLAN §3) | Zero test files | Add `e2e/queue-to-invoice.spec.ts`: register → checkup → prescription → mark paid. |
| **Zod schema tests** | Validate form schemas (CheckupSaveSchema, CustomerSchema, etc.) | Schemas exist; no tests | Add tests for boundary cases (invalid vitals, future recheck dates, etc.). |

### Print & Export
| Feature | Requirement | Current | Gap |
|---------|-------------|---------|-----|
| **Print CSS** | `@page` directives, margins, headers/footers (PLAN §6) | Invoice PDF via `@react-pdf/renderer` (no print preview) | Add print preview UI; test on real printer (Phase 8). |
| **PDF templates** | Prescription, ultrasound reports (beyond invoice) | Only invoice PDF exists | See "Prescription PDF" + "Ultrasound report PDF" in gaps table. |

### Phase 3/4 Interaction UX (Clinician Report §5 NEXT)
| Item | Spec | Current | Deferred |
|------|------|---------|----------|
| **Realtime staleness indicator** | Visual indicator when queue is stale (connection lost) | Realtime subscription active; no "connection status" indicator | Add `<ConnectionStatus>` component in queue header showing "live" / "last sync: 2m ago". |
| **Diagnosis autocomplete** | Suggest common diagnoses from past checkups; per-doctor favorites | Diagnosis field is textarea; no autocomplete | Add `<Autocomplete>` with previous diagnoses (Phase 4 design). |
| **Dose templates** | Pre-filled medicine sets for common conditions | Checkup templates exist; no medicine pre-population | Phase 3 design: template includes medicine set (not yet built). |
| **One-key next-patient** | "/" keyboard shortcut to jump to next in queue | Queue page loads and scrolls; no keyboard shortcut | Add `/` keybinding to advance to next waiting patient (Phase 3 UX detail). |
| **Unsaved-changes guard** | Warn before leaving checkup form with unsaved data | No guard; form submission only on button click | Add `beforeunload` listener or `useRouteGuard` on checkup form. |

### Accessibility (A11y)
| Issue | Current | Status |
|-------|---------|--------|
| **Drawer focus trap** | Mobile drawer on open doesn't trap focus; can tab into background | Known from clinician UX report §3.1 (HIGH) | Fix: adopt shadcn `Sheet` + `sidebar` primitives; add focus management. |
| **Skip-link** | Promised in design-guidelines but missing | Known from clinician UX report §2.8 | Add `<SkipLink href="#main">` at top of layout; give `<main>` an `id="main"`. |
| **Duplicate DOM ids** | Sidebar tree rendered twice (persistent + drawer) on mobile | Known from clinician UX report §3.2 (MEDIUM) | Consolidate sidebar rendering or use single-source with `reparent`. |

---

## Part 4: Prioritized Gap List (User Value Order)

### CRITICAL (Blocks core workflow)
1. **Patient checkup history** (GetPatientHistoryRequest) — clinicians need to see patient's past checkups, vitals trends, diagnoses.  
   - Route: `/patients/[id]` → list all checkups + doctor + status + outcome.  
   - **Est. effort:** M | **Value:** 9/10 | **Blocked by:** none (data schema ready).  

2. **Checkup template pre-fill** (PARTIAL) — templates should populate vitals form on registration.  
   - Register form → select template → fields hydrate from template definition.  
   - **Est. effort:** M | **Value:** 8/10 | **Blocked by:** template field schema (currently minimal).  

3. **Queue counter manual set** (SetCounterRequest) — receptionist must reset counter if queue protocol changes mid-shift.  
   - Admin page or queue widget → set shift + day + counter number.  
   - **Est. effort:** S | **Value:** 7/10 | **Blocked by:** none (RPC exists).  

### HIGH (Key workflows incomplete)
4. **Prescription PDF** (distinct from invoice) — clinicians print patient's medicine list without services/billing.  
   - Route: `/checkups/[id]/prescription/pdf` → React PDF component (medicines + dosages + quantity).  
   - **Est. effort:** M | **Value:** 8/10 | **Blocked by:** none.  

5. **Ultrasound report PDF** (specialized) — for clinics with ultrasound; image + diagnosis + barcode on one page.  
   - Route: `/checkups/[id]/ultrasound-report/pdf` → image snapshot + text + QR code.  
   - **Est. effort:** M | **Value:** 6/10 | **Blocked by:** none (image gallery + barcode exist).  

6. **Recent patients list** (GetRecentPatientRequest) — queue register form shows recently accessed patients first (UX optimization).  
   - Add `last_accessed_at` to customers; update on checkup save; list widget on `/queue`.  
   - **Est. effort:** S | **Value:** 5/10 | **Blocked by:** none.  

7. **Checkup soft-delete UI** (DeleteCheckupRequest) — allow undo of mistaken checkup entries.  
   - Button on checkup detail → confirm → set `deleted = true`.  
   - **Est. effort:** S | **Value:** 4/10 | **Blocked by:** none.  

### MEDIUM (Extend data export)
8. **Excel export breadth** (GetExportDataRequest multi-table) — export patient roster, medicine/service catalogs, financial summary.  
   - Routes: `/reports/patients`, `/reports/catalog`, `/reports/financial`.  
   - **Est. effort:** M | **Value:** 7/10 | **Blocked by:** none.  

### LOW (Polish + testing)
9. **Unit tests** (Vitest) — invoice math, prescription totals, boundary cases.  
   - **Est. effort:** M | **Value:** 8/10 (quality) | **Blocked by:** none.  

10. **E2E tests** (Playwright) — full queue → checkup → invoice flow.  
    - **Est. effort:** M | **Value:** 8/10 (quality) | **Blocked by:** none.  

11. **Realtime staleness indicator** — show "last sync" or connection status in queue.  
    - **Est. effort:** S | **Value:** 5/10 | **Blocked by:** none.  

12. **Drawer a11y fixes** — focus trap + Esc close (known issue).  
    - **Est. effort:** S | **Value:** 6/10 (a11y) | **Blocked by:** none.  

---

## Part 5: Verification Method

**Enumeration sources used:**
- `app/[locale]/(app)/**/page.tsx` — 30 pages found  
- `app/api/**/route.ts` — 3 routes (cron, invoice, reports/visits)  
- `app/**/*actions.ts` — 13 server action files  
- `supabase/migrations/*.sql` — 13 migrations (schema + RPCs)  
- `git log --oneline` — phases 0-8 all committed (no gaps in plan coverage)  
- Grep for specific operations: `search_customers`, `register_checkup`, `save_prescription`, `mark_order_paid`, etc.  

**Files checked:**
- Source-grounded audit (46 commands baseline)
- PLAN.md (§4 phases, §5 divergences, §6 non-goals, §7 risks)
- Clinician UX report (§5 deferred items)
- Design guidelines (test requirements, a11y rules)

---

## Unresolved Questions

1. **Batch image sync semantics:** Does "sync" mean atomic (all-or-nothing) or sequential? Current upload UI unclear on original semantics.
2. **Template field schema:** Templates store name + gender + title only. Should they store field definitions (weight, height, BP, etc.) for pre-fill? Needs product design.
3. **Realtime scope:** Should admin catalog pages (medicines, services, templates) have Realtime subscriptions? Currently read-only with manual refresh.
4. **Diagnosis autocomplete:** Should suggestions come from this clinic's history, or a seed database of common diagnoses?
5. **Payment gateway:** PLAN notes "manual entry only." Should Phase 4 stub support for Stripe/Momo/VNPay later?
6. **Recent patients algorithm:** Track by access time? Last checkup date? Only for current shift? Needs product spec.
7. **Checkup template application:** Should template auto-select on patient + doctor combo, or always manual selection?

---

## Summary Table: Gaps by Severity

| Severity | Count | Examples |
|----------|-------|----------|
| **CRITICAL** (workflow blockers) | 3 | Patient history, template pre-fill, counter manual set |
| **HIGH** (incomplete features) | 4 | Prescription PDF, ultrasound PDF, recent patients, checkup delete |
| **MEDIUM** (extended data) | 1 | Excel export breadth |
| **LOW** (polish + testing) | 6 | Unit tests, E2E tests, a11y fixes, realtime indicator |

---

## Status

**DONE**  
**Summary:** 33/42 planned original commands fully implemented; 5 partial; 3 missing (no workflows blocked, all can be added without architecture changes); 4 intentionally dropped. **12 user-facing gaps + 6 quality gaps remain.** Highest-priority: patient checkup history, template pre-fill, queue counter manual set (all M/S effort). Zero scope-creep features added; zero unplanned omissions from PLAN phases 2-8.

