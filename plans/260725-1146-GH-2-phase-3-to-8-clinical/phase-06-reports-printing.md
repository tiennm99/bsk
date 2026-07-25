# Phase 6 — Printing & Reports

**Depends on:** Phase 4 (orders/services/invoice data), Phase 5 (images for ultrasound report). Phase 3 (checkups) baseline.
**Goal:** Server-rendered PDFs (replaces JasperReports), Excel export (replaces Apache POI), and an analytics dashboard.

Original: GetExportData (Excel); print operations — Medicine invoice, Ultrasound report, Prescription (JasperReports → `@react-pdf/renderer`); dashboard stats.

## Slices

| # | Slice | Original | Data flow |
|---|---|---|---|
| 6a | PDF infra + VN font | (JasperReports engine) | register Unicode font in @react-pdf; shared PDF Route Handler pattern |
| 6b | Medicine invoice PDF | MedicineInvoice print | fetch order+items → render itemized PDF → stream download |
| 6c | Prescription PDF | prescription print | fetch order+items+dosage → PDF |
| 6d | Ultrasound report PDF | UltrasoundResult print | fetch checkup+diagnosis+images+barcode → PDF |
| 6e | Excel export | GetExportData | admin selects dataset → server builds xlsx → download |
| 6f | Dashboard analytics | DashboardPage stats | today queue size, completed count, revenue trend |

## PDF architecture (`@react-pdf/renderer` v4)

- Render server-side in **Route Handlers** (`app/[locale]/(app)/checkups/[id]/invoice/pdf/route.ts` etc.), NOT Server Actions — return `application/pdf` stream. Auth: check `getServerSession` enrolled at top of handler; 403 otherwise.
- Data fetch inside handler via user client (RLS applies) → pass plain data to a React-PDF `<Document>` component in `lib/pdf/*`.
- **VN font embedding (critical):** @react-pdf default fonts lack full Vietnamese diacritics. Register a Unicode font (e.g. Noto Sans / Be Vietnam Pro) via `Font.register` once. Test with "Nguyễn Thị Phượng" — DECISION 9.
- Components: `lib/pdf/invoice-document.tsx`, `prescription-document.tsx`, `ultrasound-document.tsx`, `pdf-theme.ts` (page size, margins, font).
- Paper: default A5 for invoice/prescription, A4 for ultrasound report (DECISION 9 — confirm vs clinic printers). Set `<Page size=...>`.
- Ultrasound report embeds images: fetch 1h signed URLs (Phase 5) → `<Image src>`; embed barcode as data-URL (bwip-js) — keep server-side render deterministic.

## Excel export (`xlsx`)

- Admin-only Route Handler `/api/export/[dataset]/route.ts` (or action returning blob). Datasets: visit history, monthly revenue (DECISION 10). Server builds workbook from RLS-scoped queries; streams `.xlsx`.
- Money columns integer VND; date columns VN tz formatted.

## Dashboard (recharts)

- `/dashboard` enrich (currently placeholder). RSC fetch: today's queue size (count waiting+in_progress for VN-today), completed checkups (done today), revenue trend (SUM paid orders per day, last N days). Client `recharts` line/bar for trend; numbers server-rendered.
- Role-scoped: admin sees revenue; clinical sees queue/completed. Cashier sees revenue+unpaid count.

## RLS / access

- All reads via user client → RLS applies. PDF/Excel handlers add `getServerSession` enrolled gate + dataset-specific role (revenue export/dashboard revenue = admin/cashier).
- No new tables (pure read/aggregation). Optionally a `revenue_by_day` SQL view (SECURITY INVOKER) for the dashboard to keep aggregation in DB.

## Server actions / handlers

- Route Handlers for each PDF + Excel (stream binary; actions can't stream well).
- `lib/reports/revenue.ts` — shared aggregation query helper.
- Audit: PDF/Excel generation is a **read** → not audited per cross-cutting rule 4. (Optionally log `export.generate` for compliance visibility — DECISION 10; default: no.)

## UI routes

- Print buttons on `/checkups/[id]` (invoice, prescription, ultrasound) → open PDF route in new tab / download.
- `/admin/export` — dataset picker (admin). Nav: `nav.export` (admin).
- `/dashboard` — enriched analytics.

## Test matrix

- **Vitest:** invoice PDF total math parity with Phase 4 aggregation; Excel row/column shape; revenue-by-day aggregation; VN date formatting.
- **Integration:** PDF handler 403 for unauthenticated; revenue export blocked for non-admin/cashier; diacritics render (snapshot or byte-presence check for embedded font).
- **Playwright:** open invoice PDF → 200 + application/pdf; dashboard renders trend chart.

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Vietnamese diacritics render as tofu | High×High | register Unicode font; explicit diacritic test; block phase accept until passes |
| PDF render CPU on Hobby (4h/mo) | Low×Med | clinic volume low; render on demand not batch; @react-pdf is fast; monitor usage |
| Signed image URL expired mid-render | Low×Med | fetch fresh URL inside handler immediately before render |
| Excel large export times out | Low×Med | bound date range; paginate/stream; educational data small |
| Revenue leak to wrong role | Low×High | role gate on revenue dashboard + export handler |

## Rollback

Read-only phase — no schema (except optional view). Revert = remove routes/buttons; zero data impact. Safest phase to roll back.

## Open DECISIONS (plan.md #9, #10)

9. Print CSS/paper — page sizes (A5 invoice? A4 report? thermal receipt?), margins, header/footer, VN font choice. Confirm against actual clinic printers.
10. Excel export scope — datasets + who exports (admin-only default); audit exports? (default no).

## Acceptance

typecheck/lint/build green; PDFs render VN diacritics correctly (test); totals match Phase 4; Excel downloads valid xlsx; dashboard numbers correct for VN-today; revenue role-gated; VI/EN strings.
