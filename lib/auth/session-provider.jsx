"use client";

import { createContext, useContext } from "react";

/** @typedef {import("@/lib/auth/get-server-session").User} User */

// ── Context ───────────────────────────────────────────────────────────────────

const SessionContext = createContext(/** @type {User | null} */ (null));

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Thin client wrapper that makes the server-read `user` available to any
 * client component in the subtree via `useSession()`.
 *
 * The `user` value is read once per request in `[locale]/layout.tsx` (outside
 * any `'use cache'` scope) and passed in as a prop — this component does NOT
 * make any Supabase calls itself.
 *
 * Phase 06 consumes this via `useSession()` for: sidebar user badge,
 * sign-out button, and client-side role checks.
 *
 * @param {{ user: User | null; children: import("react").ReactNode }} props
 */
export function SessionProvider({ user, children }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the current authenticated user, or `null` when unauthenticated.
 * Must be called from a client component inside `<SessionProvider>`.
 *
 * @returns {User | null}
 */
export function useSession() {
  return useContext(SessionContext);
}
