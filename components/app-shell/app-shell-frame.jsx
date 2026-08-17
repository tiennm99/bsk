"use client";

/**
 * AppShellFrame — Client Component.
 *
 * Owns the responsive chrome: a persistent sidebar at `md+`, and an off-canvas
 * drawer + hamburger top-bar below `md`. The (server-rendered) sidebar tree is
 * passed in as the `sidebar` prop so this file stays free of data fetching.
 *
 * The mobile drawer is a proper modal: focus moves in on open, Tab is trapped,
 * Esc closes it, body scroll is locked, and focus returns to the trigger on
 * close. Uses `h-dvh` (not `h-screen`) so mobile browser chrome doesn't clip
 * the layout. Drawer auto-closes on route change.
 */

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

const DRAWER_ID = "app-mobile-drawer";
const MAIN_ID = "main-content";

/**
 * @typedef {object} AppShellFrameProps
 * @property {import("react").ReactNode} sidebar
 * @property {import("react").ReactNode} children
 */

/** @param {AppShellFrameProps} props */
export function AppShellFrame({ sidebar, children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("app");
  const drawerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const triggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));

  // Close the drawer on route change (nav tap, redirect). Adjusting state
  // during render on a changed value is the React-recommended pattern — no
  // effect, no cascading render.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  // Modal behaviors while the drawer is open: move focus in, trap Tab, Esc to
  // close, lock body scroll, restore focus to the trigger on close. These are
  // external-system syncs (DOM focus / listeners / body style), the legitimate
  // use of an effect.
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = () =>
      /** @type {HTMLElement[]} */ (
        Array.from(
          drawer.querySelectorAll(
            'a[href],button:not([disabled]),select,input,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        )
      );

    focusable()[0]?.focus();

    const trigger = triggerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      // focus the trigger captured at open-time (ref may have changed by now).
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Skip-link: first focusable, jumps keyboard users past the nav. */}
      <a
        href={`#${MAIN_ID}`}
        className="bg-background text-foreground focus-visible:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:shadow focus-visible:ring-2"
      >
        {t("skipToContent")}
      </a>

      {/* Persistent sidebar — desktop only. */}
      <div className="hidden md:flex" data-print-hidden>
        {sidebar}
      </div>

      {/* Off-canvas drawer — below md, only when opened. */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" data-print-hidden>
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            id={DRAWER_ID}
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
            className="absolute inset-y-0 left-0 flex"
          >
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar with hamburger — below md only. */}
        <header
          className="border-border flex h-14 shrink-0 items-center gap-2 border-b px-3 md:hidden"
          data-print-hidden
        >
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("openMenu")}
            aria-expanded={open}
            aria-controls={DRAWER_ID}
            className="text-foreground hover:bg-muted focus-visible:ring-ring flex size-11 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-foreground text-lg font-bold tracking-tight">BSK</span>
        </header>

        <main id={MAIN_ID} tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
