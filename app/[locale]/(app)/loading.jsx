/**
 * Route-transition fallback for the authenticated app. A calm centered spinner
 * (respects prefers-reduced-motion via the global rule in globals.css).
 */

export default function AppLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="border-muted-foreground/30 border-t-foreground size-6 animate-spin rounded-full border-2" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
