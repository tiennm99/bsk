/**
 * Shared constants + validation for checkup imaging (Phase 5). Shared
 * client/server. Storage layout: private bucket `bsk-checkup-media`, object
 * key `${checkupId}/${uuid}.jpg`. Compression happens client-side (canvas →
 * JPEG, quality stepped down until ≤200KB); signed URLs are issued
 * server-side with a 1h TTL and never persisted.
 */

import { z } from "zod";

export const CHECKUP_MEDIA_BUCKET = "bsk-checkup-media";
export const MAX_IMAGE_BYTES = 200 * 1024; // 200 KB — Hobby-tier storage budget (PLAN §5, §7)
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

const UUID_JPG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;

/**
 * Builds the object key for an uploaded image — `{checkupId}/{uuid}.jpg`.
 * @param {number} checkupId
 * @param {string} uuid
 * @returns {string}
 */
export function buildStoragePath(checkupId, uuid) {
  return `${checkupId}/${uuid}.jpg`;
}

/**
 * Validates that a storage path belongs to the given checkup and matches the
 * `{uuid}.jpg` naming convention. Prevents a client from recording metadata
 * that points at an object under a different checkup (or an arbitrary key).
 *
 * @param {number} checkupId
 * @param {string} path
 * @returns {boolean}
 */
export function isValidStoragePath(checkupId, path) {
  const parts = path.split("/");
  if (parts.length !== 2 || parts[0] !== String(checkupId)) return false;
  const filename = parts[1] ?? "";
  return UUID_JPG.test(filename);
}

export const RecordImageSchema = z.object({
  checkupId: z.coerce.number().int().positive(),
  storagePath: z.string().trim().min(1).max(300),
});

export const DeleteImageSchema = z.object({
  checkupId: z.coerce.number().int().positive(),
  imageId: z.coerce.number().int().positive(),
  storagePath: z.string().trim().min(1).max(300),
});

/**
 * @typedef {
 *   | { status: "idle" }
 *   | { status: "error"; message: string }
 *   | { status: "success" }
 * } ImageActionState
 */
