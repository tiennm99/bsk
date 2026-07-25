# Phase 5 — Imaging (Supabase Storage)

**Depends on:** Phase 3 (`checkups`). Parallel-safe with Phases 4, 7 (separate bucket + table + routes).
**Goal:** Per-checkup ultrasound/clinic images. Replaces Google Drive OAuth (PLAN §5) with Supabase Storage. **Dominant free-tier storage consumer — cost controls are mandatory, not optional (PLAN §7).**

Original commands: UploadCheckupImage, GetCheckupImage, DeleteCheckupImage, GetImagesByCheckupId, SyncCheckupImages. Plus barcode/QR (BarcodeGenerator).

## Slices

| # | Slice | Commands | Data flow |
|---|---|---|---|
| 5a | Storage bucket + metadata table + RLS | (infra) | private bucket `bsk-checkup-media`; `checkup_images` rows track objects |
| 5b | Single upload + gallery | UploadCheckupImage, GetImagesByCheckupId | compress client → upload → insert metadata → list w/ signed URLs |
| 5c | Delete | DeleteCheckupImage | remove object + soft-delete/remove metadata row; audit |
| 5d | Webcam capture | (UploadCheckupImage variant) | getUserMedia → canvas → JPEG ≤200KB → same upload path |
| 5e | Batch sync | SyncCheckupImagesRequest | multi-file select → sequential compress+upload → batch metadata insert |
| 5f | Barcode/QR | BarcodeGenerator | `bwip-js` client-side; encodes checkup id (DECISION 7) |
| 5g | Retention sweep | (new; PLAN §5) | nightly cron deletes objects >7 days (Phase 7 cron infra, but sweep logic owned here) |

## Storage + table

**Bucket** `bsk-checkup-media` — **private** (never public; PLAN §2.3). Path convention: `checkup/{checkup_id}/{uuid}.jpg`. Bucket RLS policies (Supabase storage.objects): read/write only for enrolled BSK users with checkup access.

**`bsk.checkup_images`** (audit §1.4 inferred CheckupImage):
| Column | Type | Notes |
|---|---|---|
| id | bigint identity PK | |
| checkup_id | bigint NOT NULL → checkups(id) | |
| object_path | text NOT NULL | storage key (not a URL) |
| byte_size | integer | for budget monitoring |
| content_type | text | image/jpeg |
| uploaded_by | uuid → auth.users | |
| deleted | boolean DEFAULT false | |
| created_at | timestamptz DEFAULT now() | retention sweep keys on this |

Index `(checkup_id) WHERE NOT deleted`, `(created_at)` (sweep).

Store **object_path only, never signed URLs** (PLAN §5 — signed URLs are ephemeral, regenerated per request, 1h TTL).

## Cost controls (mandatory — PLAN §5, §7)

- **Compression:** client-side canvas + JPEG quality knob, target **≤200 KB/image**. Reject/re-compress if over. Unit-test the size guard.
- **Signed URL TTL:** **1 hour**. Generated on read (`createSignedUrl`), never persisted. Never embed long-lived URLs.
- **Retention:** **7 days** from `created_at`. Nightly Vercel Cron (`/api/cron/sweep-media`) lists objects older than 7d, deletes from Storage + marks metadata deleted. Uses admin client (privileged).
- **Budget math (PLAN §5):** 200KB × 5 photos × 20 checkups/day × 7 days ≈ 140 MB resident — headroom under 1GB shared with sibling apps.

## RLS / access

- `checkup_images` SELECT: enrolled. INSERT: clinical. UPDATE (soft-delete): clinical. No DELETE grant on the metadata table; storage object deletion via admin client in the delete action + sweep.
- Storage bucket policies: mirror — enrolled users can read/insert objects under `checkup/`; deletes via server action (admin client) to keep policy simple. Signed URL issuance runs server-side (checks session enrolled) so raw object access is never exposed.
- Barcode/QR encodes **checkup id only** (opaque), NOT CCCD (privacy — DECISION 7).

## Server Actions / routes

- `lib/images/image-schema.ts` (Zod: file constraints, checkup_id).
- `checkups/[id]/images/actions.ts`:
  - `uploadCheckupImageAction` — receives already-compressed blob (FormData); uploads via user client to bucket; inserts metadata; audit `image.upload`.
  - `deleteCheckupImageAction` — admin client removes object; marks metadata deleted; audit `image.delete`.
  - `getSignedUrlsAction` (or RSC) — issue 1h signed URLs for a checkup's images.
  - `batchSyncImagesAction` — accept N blobs; loop upload; batch metadata; audit `image.sync` (count in details).
- Route Handler `/api/cron/sweep-media` (Phase 7 cron registers it; logic here) — admin client, delete >7d.

Client: `webcam-capture.tsx` (`"use client"`, getUserMedia + canvas compress), `image-gallery.tsx` (signed-URL thumbnails), `barcode.tsx` (bwip-js). Compression util `lib/images/compress.ts` (canvas → JPEG quality loop until ≤200KB).

## realtime/PDF/QStash

- No realtime. Barcode = client-side bwip-js (no server CPU, PLAN §5). Sweep = Vercel Cron (Phase 7). Signed images feed Phase 6 ultrasound-report PDF.

## Test matrix

- **Vitest:** compression size guard (mock canvas → assert ≤200KB path/reject); object_path builder; sweep predicate (>7d selected, ≤7d kept).
- **Integration:** RLS — non-enrolled cannot read objects; signed URL expires; metadata insert requires clinical role.
- **Playwright:** upload image → appears in gallery → delete → gone. (Webcam mocked/skipped in CI.)

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Storage blows 1GB shared quota | Med×High | 200KB cap + 7-day sweep + byte_size monitoring; hard cap photo_num per checkup (template.photo_num) |
| Orphaned objects (metadata deleted, object left / vice versa) | Med×Med | delete action removes object THEN marks metadata; sweep reconciles by listing bucket, not just table |
| Signed URL leak / long TTL | Low×High | 1h TTL, server-issued, never persisted |
| CCCD in printable barcode → privacy leak | Med×High | encode checkup id only |
| Webcam unsupported / permission denied | Med×Low | fallback to file upload; feature-detect getUserMedia |
| Cross-app bucket collision | Low×Med | `bsk-` bucket prefix (PLAN §2.3) |

## Rollback

Additive. Revert = empty + drop bucket, drop `checkup_images` (pre-prod). Phase 6 ultrasound PDF degrades gracefully if no images. Disable `/checkups/[id]/images` nav/route to soft-disable.

## Open DECISIONS (plan.md #7, #8)

7. Barcode/QR payload — checkup id (default) vs signed token vs CCCD (reject CCCD).
8. Retention exemption — sweep-all (default, educational) vs preserve finalized-report images. Confirm no clinical retention requirement.

## Acceptance

typecheck/lint/build green; every image ≤200KB (test); signed URLs 1h; sweep deletes >7d (test); bucket private + RLS-gated; barcode encodes id not CCCD; audit on upload/delete/sync; VI/EN strings.
