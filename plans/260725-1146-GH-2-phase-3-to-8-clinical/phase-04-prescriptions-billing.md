# Phase 4 — Prescriptions, Services & Billing

**Depends on:** Phase 3 (`checkups`). **Blocks:** Phase 6 (invoice/prescription PDF, revenue dashboard). Parallel-safe with Phases 5, 7.
**Goal:** Attach medicines + services to a checkup, compute totals, take payment. Replaces original MedicineOrder/OrderItem/CheckupService + Medicine/Service catalogs.

Original commands: AddMedicine, EditMedicine, GetMedInfo, AddService, EditService, GetSerInfo, GetOrderInfoByCheckup.

## Slices

| # | Slice | Commands | Data flow |
|---|---|---|---|
| 4a | Medicine catalog CRUD | AddMedicine/EditMedicine/GetMedInfo | admin manages `medicines`; doctors read for prescribing |
| 4b | Service catalog CRUD | AddService/EditService/GetSerInfo | admin manages `services`; clinical read for assignment |
| 4c | Prescription composer | (new order + items) | doctor searches meds → adds line (qty/dosage) → autosum → persists order + items |
| 4d | Service assignment | (checkup_services) | clinical assigns services to checkup w/ qty → cost |
| 4e | Invoice view + totals | GetOrderInfoByCheckup | aggregate meds+services grand total per checkup |
| 4f | Cashier payment | (payment_status) | cashier marks paid + method; audit |

## Tables (audit §1.3-1.4). Money = integer VND.

**`bsk.medicines`** (original Medicine): id PK, med_name text NOT NULL, med_company text, med_unit text, med_price integer (cost), med_selling_price integer, med_supplement text, med_route text, deleted, created_at.

**`bsk.services`** (original Service): id PK, service_name text NOT NULL, service_cost integer NOT NULL, deleted, created_at.

**`bsk.medicine_orders`** (original MedicineOrder — one per checkup prescription): id PK (=prescription_id), checkup_id bigint NOT NULL → checkups(id), customer_id bigint → customers(id), total_amount integer NOT NULL DEFAULT 0, status text, payment_status text NOT NULL DEFAULT 'unpaid' CHECK (in 'unpaid','paid'), payment_method text, paid_at timestamptz, processed_by uuid → auth.users, deleted, created_at. Unique `(checkup_id) WHERE NOT deleted` (one order per checkup — see DECISION 6).

**`bsk.order_items`** (original OrderItem): id PK, order_id bigint NOT NULL → medicine_orders(id), med_id bigint → medicines(id), checkup_id bigint → checkups(id), quantity_ordered integer NOT NULL CHECK (>0), dosage text, price_per_unit integer NOT NULL, total_price integer NOT NULL, notes text. Index `(order_id)`.

**`bsk.checkup_services`** (original CheckupService): id PK (=service_order_id), checkup_id bigint NOT NULL → checkups(id), service_id bigint → services(id), quantity integer NOT NULL DEFAULT 1, total_cost integer NOT NULL, notes text. Index `(checkup_id)`.

## Totals integrity (server-authoritative)

- `order_items.total_price = quantity_ordered * price_per_unit` computed **server-side** on insert (snapshot price_per_unit from `medicines.med_selling_price` at prescribe time — price history immune to later catalog edits).
- `medicine_orders.total_amount` recomputed server-side = SUM(order_items.total_price) on every item mutation. Never trust client autosum (client autosum is UX preview only).
- Invoice grand total (4e) = medicine_orders.total_amount + SUM(checkup_services.total_cost). Computed at read; not persisted separately (avoids drift).

## RLS intent

- `medicines`, `services` SELECT: enrolled. INSERT/UPDATE: **admin** (catalog). No DELETE.
- `medicine_orders`, `order_items`, `checkup_services` SELECT: enrolled. INSERT/UPDATE: clinical (`admin,receptionist,doctor,nurse`) for composing.
- Payment: `medicine_orders` UPDATE of payment fields gated to `admin,cashier`. **Split policy:** clinical can UPDATE order content; only admin/cashier can flip `payment_status`→paid. Enforce via a dedicated `mark_paid` RPC (SECURITY INVOKER, checks `current_role() IN ('admin','cashier')`) OR a column-scoped policy — RPC is simpler + auditable. Default: `bsk.mark_order_paid(order_id, method)` RPC.

## Server Actions

- `lib/medicines/medicine-schema.ts`, `lib/services/service-schema.ts`, `lib/orders/order-schema.ts` (Zod, shared).
- `admin/medicines/actions.ts`: create/update/deactivate (admin, RLS gate, audit `medicine.*`).
- `admin/services/actions.ts`: same for services.
- `checkups/[id]/prescription/actions.ts`: `addOrderItemAction`, `removeOrderItemAction`, `upsertOrderAction` (recompute total_amount each time), audit `order.*`.
- `checkups/[id]/services/actions.ts`: assign/remove service, audit `checkup_service.*`.
- `billing/actions.ts`: `markPaidAction` → `mark_order_paid` RPC, audit `invoice.pay` (records method + processed_by).

## UI routes

- `/admin/medicines` — catalog CRUD (admin). Nav: `nav.medicines` (admin only).
- `/admin/services` — catalog CRUD (admin). Nav: `nav.services` (admin only).
- `/checkups/[id]/prescription` — composer: medicine search (reuse accent-insensitive pattern), line editor (qty/dosage), live autosum, save. Doctor/nurse.
- `/checkups/[id]` invoice panel — meds + services + grand total; "Mark paid" for cashier/admin.
- `/billing` (optional) — unpaid orders list for cashier. Nav: `nav.billing` (cashier/admin).

## realtime/PDF/QStash

- No realtime here (billing is not live-fanned). PDF invoice/prescription = Phase 6. This phase persists the data those PDFs render.

## Test matrix

- **Vitest:** order-item total (qty×price), order total_amount recompute after add/remove, grand-total aggregation, price snapshot immutability (edit catalog after prescribe → old item price unchanged).
- **Integration:** RLS — cashier cannot edit medicine catalog; nurse cannot mark paid (only admin/cashier); price snapshot on insert.
- **Playwright:** doctor prescribes 2 meds + 1 service → invoice grand total correct → cashier marks paid → payment_status=paid.

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Client autosum trusted → wrong total | Med×High | server recompute authoritative; client sum is preview only |
| Catalog price edit retroactively changes past invoices | Med×High | snapshot price_per_unit onto order_items at prescribe time |
| Double-pay / pay race | Low×Med | `mark_order_paid` RPC idempotent (WHERE payment_status='unpaid'); audit each attempt |
| Role bleed (nurse marks paid) | Low×Med | payment via RPC gated to admin/cashier, not table UPDATE policy |

## Rollback

Additive tables. Revert = drop 5 tables + RPC (pre-prod). No table outside Phase 4 references orders/items/services except Phase 6 (read-only PDF/export) and Phase 3 checkups (FK parent, unaffected).

## Open DECISIONS (plan.md #5, #6)

5. Payment: manual-only (default) vs gateway (VNPay/Momo/Stripe). Manual changes nothing beyond `payment_method` text; gateway adds a payments route + webhook + reconciliation — big scope. **Confirm before 4f.**
6. Invoice: single aggregated invoice-per-checkup (default; persist meds+services separately, aggregate at read) vs separate medicine/service invoices. Affects the `unique(checkup_id)` constraint on medicine_orders.

## Acceptance

typecheck/lint/build green; totals server-computed + tested; price snapshot immune to catalog edits; payment gated admin/cashier; audit on every mutation; VI/EN strings.
