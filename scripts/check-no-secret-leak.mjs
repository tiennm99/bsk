#!/usr/bin/env node
/**
 * CI guard: fail the build if any tracked file assigns an `sb_secret_*`
 * value to a `NEXT_PUBLIC_*` variable. NEXT_PUBLIC_* is bundled to the
 * browser by Next.js — a server secret in one is a public secret.
 *
 * Detects the obvious foot-gun (assignment on a single line). Does not
 * try to catch cross-line indirection — this is defense-in-depth, not a
 * comprehensive secret scanner.
 *
 * Runs locally via `pnpm check:no-secret-leak` and in CI before lint.
 */

import { spawnSync } from "node:child_process";

// NEXT_PUBLIC_FOO = "sb_secret_..." | NEXT_PUBLIC_FOO: sb_secret_... | NEXT_PUBLIC_FOO=sb_secret_...
const PATTERN = String.raw`NEXT_PUBLIC_[A-Z0-9_]+\s*[=:]\s*["']?sb_secret_`;

const result = spawnSync(
  "git",
  ["grep", "-nE", PATTERN, "--", ".", ":(exclude)pnpm-lock.yaml", ":(exclude)scripts/check-no-secret-leak.mjs"],
  { encoding: "utf8" },
);

// git grep: exit 0 = matches found, 1 = no matches, other = git error
if (result.status === 1) {
  process.stdout.write("[check-no-secret-leak] OK — no NEXT_PUBLIC_*=sb_secret_* assignments found.\n");
  process.exit(0);
}

if (result.status === 0) {
  process.stderr.write(
    "[check-no-secret-leak] FAIL — server secret assigned to a NEXT_PUBLIC_* variable:\n\n" +
      result.stdout +
      "\nNEXT_PUBLIC_* values are bundled into the browser by Next.js. Move the secret to a\n" +
      "non-public env var (e.g. SUPABASE_SECRET_KEY) and read it only from server-side code.\n",
  );
  process.exit(1);
}

process.stderr.write(`[check-no-secret-leak] git grep failed (exit ${result.status}):\n${result.stderr}\n`);
process.exit(2);
