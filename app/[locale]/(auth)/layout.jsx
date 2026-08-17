/**
 * Auth route-group layout.
 *
 * Applies to all routes under (auth)/ (currently only /sign-in).
 * Centers the card content on the page; no sidebar, no app nav.
 * Deliberately does NOT call getServerSession() — this is a public route.
 */
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Brand mark */}
      <div className="mb-8 text-center">
        <span className="text-foreground text-2xl font-bold tracking-tight">BSK</span>
        <p className="text-muted-foreground mt-1 text-sm">Clinic Management System</p>
      </div>

      {/* Card shell — form renders as children */}
      <div className="border-border bg-background w-full max-w-sm rounded-lg border p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
