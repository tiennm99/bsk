# Phase 3 — Queue & Checkup Workflow

**Depends on:** Phase 2 (`customers`, `doctors`, `checkup_templates`). **Blocks:** Phases 4, 5, 6, 7.
**Goal:** The clinical core — register patient into today's queue, doctor works the queue in realtime, records vitals+diagnosis, sets recheckup date. This is the highest-risk phase (realtime + concurrency + status machine).

Original commands covered: GetPatientHistory, GetCheckUpQueue, GetCheckUpQueueUpdate (realtime), SetCounter, GetCounter, CallPatient, AddCheckup, SaveCheckup, GetCheckupData, DeleteCheckup, AddRemindDate (write side; list side → Phase 7).

## Slices (each shippable)

| # | Slice | Commands | Data flow |
|---|---|---|---|
| 3a | Checkups table + register-into-queue | AddCheckup, GetCounter, SetCounter | receptionist picks patient+doctor+shift → server assigns next queue# atomically → row `waiting` |
| 3b | Queue list (RSC snapshot) | GetCheckUpQueue | RSC reads today's checkups by shift, joined customer+doctor+status |
| 3c | Realtime queue deltas | GetCheckUpQueueUpdate | Client subscribes `bsk:queue:*`; Postgres Changes push insert/update; RLS fans out to enrolled only |
| 3d | Call patient + status machine | CallPatient | doctor clicks Call → `waiting`→`in_progress` (optimistic) → realtime notifies others |
| 3e | Checkup record form | SaveCheckup, GetCheckupData | doctor loads checkup (RSC) → fills vitals+diagnosis (template-prefilled) → save → `in_progress`→`done` |
| 3f | Patient history + soft-delete + remind_date | GetPatientHistory, DeleteCheckup, AddRemindDate | history list DESC by date; soft-delete; set remind_date |

## Tables / enums

**`bsk.checkup_status`** (enum): `waiting | in_progress | done | cancelled`
(maps original "CHỜ KHÁM"→waiting, "ĐÃ KHÁM"→done; in_progress = called; cancelled = no-show. See DECISION 4.)

**`bsk.checkups`** (audit §1.4 line 234; Drive fields dropped per PLAN §5):
| Column | Type | Notes |
|---|---|---|
| id | bigint identity PK | |
| customer_id | bigint NOT NULL → customers(id) | |
| doctor_id | bigint → doctors(id) | nullable until assigned |
| template_id | bigint → checkup_templates(id) | nullable; prefills form |
| checkup_date | date NOT NULL DEFAULT (VN today) | VN calendar day |
| shift | text/enum NOT NULL | see DECISION 2 |
| queue_number | integer NOT NULL | assigned per (date,shift) |
| checkup_type | text | original free field |
| status | checkup_status NOT NULL DEFAULT 'waiting' | |
| heart_beat | integer | vitals |
| blood_pressure | text | e.g. "120/80" |
| customer_weight | numeric | per-visit (NOT on customer) |
| customer_height | numeric | per-visit |
| suggestion | text | |
| diagnosis | text | |
| conclusion | text | |
| notes | text | |
| remind_date | date | recheckup reminder (Phase 7 reads) |
| deleted | boolean NOT NULL DEFAULT false | |
| created_at | timestamptz DEFAULT now() | |

Indexes: `(checkup_date, shift, status) WHERE NOT deleted` (queue query); `(customer_id, checkup_date DESC)` (history); `unique (checkup_date, shift, queue_number) WHERE NOT deleted` (no dup queue#).

**`bsk.daily_queue_counters`** (audit §1.4 — original `DailyQueueCounter`):
`date date, shift text, current_count integer NOT NULL DEFAULT 0, PRIMARY KEY (date, shift)`.

**Shift model:** DECISION 2. Default: no separate `shifts` table — `shift` is a small enum (`morning|afternoon|evening`) column. Add configurable `shifts` table only if required.

## Queue-number assignment (concurrency-critical)

Do NOT read-then-write from the Server Action (race → duplicate queue#). Use an atomic RPC:

```
bsk.next_queue_number(p_date date, p_shift text) RETURNS integer
  -- SECURITY INVOKER, VOLATILE
  -- INSERT INTO daily_queue_counters (date, shift, current_count) VALUES (p_date, p_shift, 1)
  --   ON CONFLICT (date, shift) DO UPDATE SET current_count = daily_queue_counters.current_count + 1
  --   RETURNING current_count;
```

AddCheckup calls this RPC inside the same action, then inserts the checkup with the returned number. Unique partial index is the backstop. `SetCounterRequest` = admin/receptionist override → direct UPDATE of `current_count` (audit-logged); `GetCounterRequest` = RSC SELECT.

## RLS intent

- `checkups` SELECT: enrolled (`current_role() IS NOT NULL`).
- `checkups` INSERT/UPDATE: clinical (`admin,receptionist,doctor,nurse`). (Doctor edits own vitals; receptionist registers. Original didn't row-scope by doctor — keep clinical-wide, YAGNI.)
- No DELETE grant (soft-delete).
- `daily_queue_counters` SELECT enrolled; UPDATE/INSERT clinical (via RPC + override).
- Realtime: Postgres Changes enforces subscriber RLS per-row → only enrolled BSK users receive queue deltas (PLAN §2.3 confirmed safe on shared project).

## Server Actions (`app/[locale]/(app)/checkups/actions.ts` + queue actions)

| Action | Client | Notes |
|---|---|---|
| `createCheckupAction` | user | calls `next_queue_number` RPC, inserts, `checkup.create` audit, revalidate queue |
| `callPatientAction` | user | UPDATE status waiting→in_progress; `checkup.call` audit; optimistic on client |
| `saveCheckupAction` | user | UPDATE vitals+diagnosis+conclusion, status→done; `checkup.save` audit; redirect |
| `setRemindDateAction` | user | UPDATE remind_date; `checkup.remind` audit |
| `deactivateCheckupAction` | user | soft-delete; `checkup.delete` audit |
| `setCounterAction` | user (admin/reception) | override current_count; `counter.set` audit |
| `getCheckupData` | RSC direct (not action) | GetCheckupData = server-component read |

Zod: `lib/checkups/checkup-schema.ts` (register schema; save/vitals schema; remind schema) — shared, no `'use server'`. Reuse `CustomerFormState`-style union.

## UI routes

- `/queue` — RSC list (today, grouped by shift) + realtime client wrapper. Receptionist + doctor + nurse. Nav: `nav.queue` (Icon: ListOrdered/Users). Client child subscribes `bsk:queue:{...}` and re-renders rows.
- `/queue/new` (or modal) — register patient into queue (patient search reuse + doctor + shift).
- `/checkups/[id]` — checkup record form (RSC load + client form; template-prefilled fields).
- `/patients/[id]/history` — patient checkup history DESC (RSC).
- Counter control on `/queue` (admin/receptionist inline form).

Realtime specifics: subscribe in a `"use client"` component receiving initial rows as props (from RSC `'use cache'`-free fetch); channel `supabase.channel('bsk:queue:'+key)` on `postgres_changes` (event `*`, schema `bsk`, table `checkups`, filter `checkup_date=eq.<vn-today>`); on payload, patch local state. Unsubscribe on unmount. Never subscribe inside `'use cache'`.

## Test matrix

- **Vitest:** `next_queue_number` sequencing (mock/pg-tap or logic unit); status-transition guard (illegal `done`→`waiting` rejected); VN-day boundary (23:59 ICT vs UTC).
- **Integration:** RLS — cashier/patient cannot INSERT checkup; enrolled can SELECT.
- **Playwright:** receptionist registers patient → doctor's `/queue` shows new row (realtime) → doctor calls → fills form → marks done → row leaves waiting list.

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Duplicate queue# under concurrent register | Med×High | atomic RPC + unique partial index (backstop) |
| Realtime not firing (RLS/publication misconfig) | Med×High | ensure `bsk` in Realtime publication; RSC snapshot is source of truth, realtime is enhancement; manual refresh fallback |
| Optimistic status diverges from server | Med×Med | reconcile on realtime echo; server is authoritative; revert optimistic on action error |
| VN-day vs UTC "today" mismatch | Med×High | server-compute VN date via date-fns-tz; never `now()::date` in UTC for the queue filter — use a `bsk.vn_today()` helper |
| Cross-app realtime channel collision | Low×Med | `bsk:` prefix (PLAN §2.3) |

## Rollback

Each slice is additive. Revert = drop the migration's new objects (checkups/counters) — but only pre-prod. Post-data: disable `/queue` nav entry + feature-flag the route; leave tables. No downstream table depends on checkups until Phase 4, so Phase 3 revert is contained.

## Open DECISIONS (need product answer — see plan.md #1-4)

1. Realtime channel per-shift vs per-day.
2. Shift = fixed enum vs configurable table.
3. Optimistic UI vs realtime-only for status.
4. Status enum value set (include `cancelled`? payment state here or only on orders?).

## Acceptance

`pnpm typecheck && lint && build` green; queue# never duplicates under concurrent inserts (test); realtime delta visible cross-client in E2E; VI/EN strings; all mutations audit-logged; RLS blocks non-clinical writes.
