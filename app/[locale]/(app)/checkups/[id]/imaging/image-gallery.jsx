"use client";

/**
 * Signed-URL thumbnail gallery for a checkup's images. Signed URLs are
 * generated server-side (page.tsx, 1h TTL) and passed down — this component
 * never re-derives or persists them. Each thumbnail has a Delete button that
 * calls deleteImageAction (soft-delete + best-effort object removal) and
 * router.refresh()es on success.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { deleteImageAction } from "./actions";

/** @typedef {{ id: number, storagePath: string, url: string | null }} GalleryImage */

/**
 * @param {{ checkupId: number, images: GalleryImage[] }} props
 */
export function ImageGallery({ checkupId, images }) {
  const t = useTranslations("imaging");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState(/** @type {number | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  /** @param {GalleryImage} image */
  function handleDelete(image) {
    setError(null);
    setPendingId(image.id);
    startTransition(async () => {
      const result = await deleteImageAction(checkupId, image.id, image.storagePath);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
      setPendingId(null);
    });
  }

  if (images.length === 0) {
    return (
      <section className="border-border rounded-md border p-4">
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image) => (
          <div key={image.id} className="border-border space-y-2 rounded-md border p-2">
            {image.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset
              <img src={image.url} alt="" className="aspect-square w-full rounded object-cover" />
            ) : (
              <div className="bg-muted aspect-square w-full rounded" />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive w-full"
              disabled={isPending && pendingId === image.id}
              onClick={() => handleDelete(image)}
            >
              {t("delete")}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
