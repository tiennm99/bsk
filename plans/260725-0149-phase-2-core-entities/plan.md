# Phase 2 — Core Entities (CRUD)

**Status:** In progress. Delivered as validated vertical slices (schema + RLS + Server Actions + UI + i18n + audit per entity).
**Goal:** Build the master-data layer that unblocks Phase 3+ (queue/checkup). Covers the original's Doctor/User/Template/Clinic/Customer/geo commands.
**Basis:** `plans/reports/researcher-260725-0048-...-report.md` (source-grounded feature list).

## Slices
| # | Entity | Original commands | Status |
|---|---|---|---|
| 2a | **Doctors** | AddDoctor/EditDoctor/GetDoctorInfo/GetDoctorGeneralInfo | ✅ DONE (this session) |
| 2b | Clinic settings | ClinicInfoRequest + settings edit | ✅ DONE (this session) |
| 2c | Patients (customers) | AddPatient/GetRecentPatient + **geo-lookup** (provinces/wards) + **accent-insensitive search** | TODO (needs geo seed + unaccent decision) |
| 2d | Checkup templates | Add/Edit/Delete/GetAllTemplates + **gender** field | TODO |
| 2e | Staff user management | AddUser/EditUser/GetAllUserInfo (extends app_users) | TODO |

## Slice 2a — Doctors (done)
- Migration `20260725015000_bsk_doctors.sql`: `bsk.doctors` (first_name, last_name, soft-delete), RLS (read=enrolled, write=admin), grants (no DELETE — soft-delete only).
- Types updated (`types/supabase-bsk.ts`).
- `lib/doctors/doctor-schema.ts` (Zod, shared client/server).
- `app/[locale]/(app)/admin/doctors/`: `actions.ts` (create/update/deactivate — admin-gated, RLS-enforced, audit-logged, revalidate), `add-doctor-form.tsx` (client RHF+useActionState), `page.tsx` (RSC list + inline edit + deactivate).
- Nav: admin gets `/admin/doctors` (`nav.doctors`, Stethoscope). i18n `admin.doctors.*` both locales.
- Pattern established: **RLS-as-gate (user client) + getServerSession defense-in-depth + Zod + log_audit + revalidatePath**. Later slices mirror it.

## Decisions locked
- **2c**: seed full VN geo (`provinces` + `wards`) + enable Postgres `unaccent` for accent-insensitive patient search.

## Open decisions (before their slices)
- **2c/2d**: `customers` full field set (CCCD, phone, DOB, gender, weight/height); `checkup_templates` field-layout storage (JSON `fields`) + gender.
- **2e**: staff management vs the existing invite flow — reconcile (invite creates auth+enrollment; edit/list/role-reassign is the new surface).

## Acceptance (per slice)
`pnpm typecheck` / `lint` / `build` green; admin-only writes enforced by RLS; mutations audit-logged; VI/EN strings present.
