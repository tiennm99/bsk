# Feature Parity Delta Verification
**Report Date:** 2026-07-25  
**Scope:** Light delta check since prior full audit (2026-07-24)  
**Baseline:** [researcher-260724-2243-original-vs-rewrite-feature-parity-report.md](researcher-260724-2243-original-vs-rewrite-feature-parity-report.md)

---

## Executive Summary

**Implemented features:** 4/43 (unchanged from prior audit)  
**Audit logging (Feature #18):** Upgraded from skeleton to **partial** — table + writer function added, not yet called from mutations  
**First-admin bootstrap (Feature #4):** Hardened with allowlist-gating (security fix, not new feature)  
**Delta:** Zero new features; pure hardening + UX polish (no regressions)

---

## Changes Since Prior Audit (2026-07-24 → 2026-07-25)

### New Migrations Added (UNCOMMITTED)

| Migration | Purpose | Delta to Features |
|-----------|---------|-------------------|
| 20260724233400_bsk_admin_allowlist.sql | Email-based gating for first-admin claim | Hardens feature #4; adds `bsk.admin_allowlist` table |
| 20260724233500_bsk_audit_log.sql | Table + writer function for audit trail | Adds infrastructure for feature #18 (still skeleton) |

### Feature #4: First-Admin Bootstrap (DONE → DONE + Hardened)

**What changed:**
- Old: `claim_first_admin(p_user_id)` accepted caller-supplied UUID; any authenticated principal on shared Supabase pool could self-promote
- New: `claim_first_admin()` with:
  - Email allowlist check (`bsk.admin_allowlist`) — infra owner seeds whitelist before first sign-in
  - Uses `auth.uid()`, never caller-supplied UUID
  - Revokes direct `INSERT` on `bsk.app_users` from `authenticated` role (least privilege)

**Status:** Still DONE; now hardened ✓  
**Call sites:** `app/[locale]/(auth)/sign-in/actions.ts` (line 100)  
**Regression risk:** None — existing sign-in flow preserved; only added security gate

---

### Feature #18: Audit Logging (SKELETON → Partial Infrastructure)

**What was added:**

1. **Table `bsk.audit_log`**
   ```sql
   id (IDENTITY), actor_id (FK auth.users), action, entity, entity_id, details (JSONB), created_at
   ```
   - Indexes on `created_at DESC` and `(entity, entity_id)`
   - RLS: `SELECT` admin-only; no client `INSERT/UPDATE/DELETE`

2. **Writer function `bsk.log_audit(action, entity, entity_id, details)`**
   - SECURITY DEFINER (clients call it, no direct table grant needed)
   - Inserts row with `auth.uid()` as `actor_id`
   - Comment: "VOLATILE, append-only by construction"

3. **RLS policy**
   - `audit_log_select_admin`: admin role only reads audit_log
   - Clients have `SELECT` grant only

**Actual call sites:** None yet
- `signInAction` — no call to `log_audit()`
- `inviteUserAction` — no call to `log_audit()`
- Comment in migration: "No rows are written yet — call sites arrive with Phase 2/3 mutations"

**Status:** SKELETON → **Partial** (infra ready; usage deferred to Phase 2/3 clinical mutations)  
**Regression risk:** None — table is read-only to clients; isolated from existing flows

---

## Implementation Count (vs. Prior Audit)

| Metric | Prior (2026-07-24) | Now (2026-07-25) | Delta |
|--------|-------------------|------------------|-------|
| Implemented (Phase 0–1) | 4/43 | 4/43 | +0 |
| Planned (Phase 2–8) | 37/43 | 37/43 | +0 |
| Dropped (non-goal) | 2/43 | 2/43 | +0 |
| Audit-log ready to use | No | Yes (table + function) | Infrastructure only |

**Conclusion:** Zero new features implemented; hardening only.

---

## Regression Check

**Scope:** Phase 1 structures + planned Phase 2+ scope  

**Phase 1 structures (intact):**
- ✓ `bsk` schema, `bsk.app_role` enum (6 roles)
- ✓ `bsk.app_users` enrollment table + ON DELETE CASCADE
- ✓ `bsk.current_role()` SECURITY DEFINER helper
- ✓ RLS policies (select own row OR admin)
- ✓ Session + auth flow (Supabase Auth cookies)

**Planned Phase 2+ tables (unchanged):**
- `bsk.customers` (patients) — PLAN
- `bsk.doctors`, `bsk.staff_users` (clinical staff) — PLAN
- `bsk.checkups`, `bsk.shifts` (queue workflow) — PLAN
- `bsk.medicines`, `bsk.services` (billing) — PLAN
- (All others per prior audit §Database Tables)

**No tables dropped, no enum modifications, no RLS regressions detected.**

---

## Hardening & UX Changes (Non-Feature)

From plan.md §Deferred cleanup DONE:

| Item | Category | Impact on Features |
|------|----------|-------------------|
| First-admin email allowlist | Security (H1) | None — hardens #4 only |
| Sign-in + invite rate limiting | Security (H2) | None — new capability, no regression |
| Locale switcher focus ring | UX (a11y) | None — polish |
| Role label i18n (vi/en) | UX | None — polish |
| Active nav `aria-current="page"` | UX (a11y) | None — polish |
| Clinical button density (≥44px) | UX | None — polish |
| Email autofocus, password reveal | UX | None — sign-in ergonomic |
| `docs/design-guidelines.md` | Docs | None — reference only |

**Zero feature regressions.**

---

## Unresolved Questions

1. **Audit log call-site timing:** Plan says "call sites land with Phase 2/3 mutations." Which phase (2 or 3) should include first audit logging — patient CRUD or checkup recording?

2. **Admin allowlist seeding:** Migration requires infra owner to manually `INSERT` into `bsk.admin_allowlist` before first sign-in. Should this be documented in the deployment guide? (Currently only in SQL comment.)

3. **Rate limiter coverage:** Now covers sign-in + invite. Should Phase 2 mutations (patient CRUD, doctor add) also be rate-limited, or only auth endpoints?

---

## Summary Table: Feature Ledger Update

| Metric | Value |
|--------|-------|
| Total original features | 43 |
| Implemented (Phase 0–1) | **4** (unchanged) |
| Planned (Phase 2–8) | **37** (unchanged) |
| Intentionally dropped | **2** (unchanged) |
| Audit infrastructure ready | **Yes** (new) |
| Security regressions | **None** |
| Clinical/business regressions | **None** |

---

Status: **DONE_WITH_CONCERNS**  
Summary: Feature count unchanged (4/43). Audit logging infrastructure added but not yet called; first-admin hardened with email allowlist; no regressions detected.  
Concerns: Audit log call-site phase unclear; admin allowlist seeding doc needed; rate limiter scope for Phase 2+ TBD.
