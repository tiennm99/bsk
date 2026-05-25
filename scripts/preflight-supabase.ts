#!/usr/bin/env tsx
/**
 * Preflight guard for `supabase db push` against the shared project.
 *
 * The shared Supabase project hosts multiple unrelated side projects (one
 * schema per app). A migration accidentally pushed to the wrong project
 * (e.g. someone's prod) is unrecoverable without a project-wide PITR that
 * also wipes sibling apps. This script refuses to proceed unless the
 * currently-linked Supabase project ref matches BSK's allow-list.
 *
 * Wire it in package.json:
 *   "db:push": "tsx scripts/preflight-supabase.ts && supabase db push"
 *
 * The allow-list is intentionally checked into the repo: it's not secret,
 * and a PR diff is the right place to notice "wait, why did the ref change?"
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// BSK is only ever linked to these project refs. Add new ones via PR.
// Source of truth: Supabase dashboard → Project Settings → General → Reference ID.
const ALLOWED_PROJECT_REFS: ReadonlyArray<string> = [
  // "abcdefghijklmnopqrst", // example: tiennm99's personal shared project
];

function readLinkedRef(): string | null {
  // `supabase link` writes the project ref to supabase/.temp/project-ref.
  try {
    const path = resolve(process.cwd(), "supabase/.temp/project-ref");
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function die(msg: string): never {
  process.stderr.write(`\n[preflight-supabase] ${msg}\n\n`);
  process.exit(1);
}

const ref = readLinkedRef();

if (!ref) {
  die(
    "No linked Supabase project found (supabase/.temp/project-ref missing).\n" +
      "Run `supabase link --project-ref <ref>` first, then re-run.",
  );
}

if (ALLOWED_PROJECT_REFS.length === 0) {
  die(
    "ALLOWED_PROJECT_REFS is empty in scripts/preflight-supabase.ts.\n" +
      "Add your BSK Supabase project ref(s) to the allow-list before pushing migrations.",
  );
}

if (!ALLOWED_PROJECT_REFS.includes(ref)) {
  die(
    `Linked Supabase project ref "${ref}" is NOT in the BSK allow-list.\n` +
      `Allowed refs: ${ALLOWED_PROJECT_REFS.join(", ")}\n\n` +
      `This guard exists because BSK shares its Supabase project with sibling apps.\n` +
      `Pushing to the wrong project can require a project-wide PITR to recover —\n` +
      `which would wipe every other app's data too.\n\n` +
      `If "${ref}" is legitimately a new BSK project, add it to ALLOWED_PROJECT_REFS\n` +
      `in scripts/preflight-supabase.ts via a PR, then re-run.`,
  );
}

process.stdout.write(`[preflight-supabase] OK — linked ref "${ref}" is in the BSK allow-list.\n`);
