"use client";

/**
 * Webcam + file capture for checkup imaging. getUserMedia drives a live
 * preview (start/stop) with a snapshot button that draws the current video
 * frame to a hidden canvas; a plain <input type=file> is the fallback for
 * devices without a camera or when getUserMedia is unavailable/denied.
 *
 * Either path ends at the same compress-then-upload flow: draw onto a canvas,
 * then canvas.toBlob('image/jpeg', q) stepping q down from 0.9 to 0.4 until
 * the blob is ≤200KB (PLAN §5/§7 storage budget). If even q=0.4 doesn't fit,
 * the upload is rejected (tooLarge) rather than silently blowing the budget.
 * On success, uploads straight to Storage via the browser client (RLS-gated),
 * then calls recordImageAction to insert the metadata row, then
 * router.refresh() so the RSC gallery re-fetches signed URLs.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CHECKUP_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  buildStoragePath,
} from "@/lib/imaging/image-schema";
import { recordImageAction } from "./actions";

const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4] as const;
// Downscale the longest side to this before quality-stepping — a full-res phone
// photo (e.g. 4000×3000) never fits 200KB on JPEG quality alone, so we must
// reduce resolution first. 1280px keeps ultrasound/clinic detail legible.
const MAX_DIMENSION = 1280;

/** Draw a source (video frame or image) onto a canvas scaled to fit MAX_DIMENSION. */
function makeScaledCanvas(
  source: CanvasImageSource,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// getUserMedia support never changes after mount, so there's nothing to
// subscribe to — this is purely a way to read a browser-only value without
// an Effect (avoids both a hydration mismatch and a setState-in-Effect).
const noopSubscribe = () => () => {};
const getCameraSupportSnapshot = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const getCameraSupportServerSnapshot = () => false;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** Steps JPEG quality down from 0.9 to 0.4 until the blob fits MAX_IMAGE_BYTES. */
async function compressToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, q);
    if (!blob) continue;
    if (!smallest || blob.size < smallest.size) smallest = blob;
    if (blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  return smallest && smallest.size <= MAX_IMAGE_BYTES ? smallest : null;
}

export function ImageCapture({ checkupId }: { checkupId: number }) {
  const t = useTranslations("imaging");
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Browser-only feature detection without an Effect: getServerSnapshot
  // returns false so SSR/hydration render the same (no-camera) markup, then
  // the real snapshot kicks in on the client — no setState-in-Effect needed.
  const supportsCamera = useSyncExternalStore(
    noopSubscribe,
    getCameraSupportSnapshot,
    getCameraSupportServerSnapshot,
  );
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stop any open camera stream on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch {
      setError(t("errorGeneric"));
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }

  async function uploadFromCanvas(canvas: HTMLCanvasElement) {
    setUploading(true);
    setError(null);
    try {
      const blob = await compressToJpeg(canvas);
      if (!blob) {
        setError(t("tooLarge"));
        return;
      }

      const path = buildStoragePath(checkupId, crypto.randomUUID());
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(CHECKUP_MEDIA_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) {
        setError(t("errorGeneric"));
        return;
      }

      const result = await recordImageAction(checkupId, path);
      if (result.status === "error") {
        setError(result.message);
        // Metadata insert failed — remove the now-orphaned object.
        await supabase.storage.from(CHECKUP_MEDIA_BUCKET).remove([path]);
        return;
      }

      router.refresh();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setUploading(false);
    }
  }

  function snapshot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = makeScaledCanvas(video, video.videoWidth, video.videoHeight);
    if (!canvas) {
      setError(t("errorGeneric"));
      return;
    }
    void uploadFromCanvas(canvas);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = makeScaledCanvas(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(objectUrl);
      if (!canvas) {
        setError(t("errorGeneric"));
        return;
      }
      void uploadFromCanvas(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError(t("errorGeneric"));
    };
    img.src = objectUrl;
  }

  return (
    <section className="border-border space-y-3 rounded-md border p-4">
      <h2 className="text-foreground text-sm font-medium">{t("capture")}</h2>

      {supportsCamera && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            playsInline
            muted
            className={streaming ? "bg-muted w-full max-w-sm rounded-md" : "hidden"}
          />
          <div className="flex flex-wrap gap-2">
            {!streaming ? (
              <Button type="button" variant="outline" onClick={startCamera} disabled={uploading}>
                {t("startCamera")}
              </Button>
            ) : (
              <>
                <Button type="button" onClick={snapshot} disabled={uploading}>
                  {uploading ? t("uploading") : t("snapshot")}
                </Button>
                <Button type="button" variant="outline" onClick={stopCamera} disabled={uploading}>
                  {t("stopCamera")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-muted-foreground text-sm" htmlFor="imaging-file-input">
          {t("choosePhoto")}
        </label>
        <input
          id="imaging-file-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="text-foreground text-sm"
        />
        {uploading && <p className="text-muted-foreground text-sm">{t("uploading")}</p>}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
