#!/usr/bin/env tsx
/**
 * Seed Vietnamese geo lookup (bsk.provinces + bsk.wards).
 *
 * Idempotent upsert from a local dataset — safe to re-run. Run once after
 * `npm run db:push`, before using patient registration (the address dropdowns
 * read these tables).
 *
 * Data file: supabase/seed/vn-geo.json (NOT committed — it's large and its
 * source/version is the operator's choice). Expected shape:
 *   [ { "code": "01", "name": "Hà Nội",
 *       "wards": [ { "code": "00001", "name": "Phường Phúc Xá" }, ... ] }, ... ]
 * Post-2025 Vietnam is a two-level system (province → ward, no districts),
 * which matches this schema. A public source: https://provinces.open-api.vn/.
 *
 * Env required (not read from .env.local automatically — pass explicitly):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 * Example:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run db:seed-geo
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

type Ward = { code: string; name: string };
type Province = { code: string; name: string; wards: Ward[] };

function die(msg: string): never {
  process.stderr.write(`\n[seed-geo] ${msg}\n\n`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in the environment.");
}

const dataPath = resolve(process.cwd(), "supabase/seed/vn-geo.json");
let provinces: Province[];
try {
  provinces = JSON.parse(readFileSync(dataPath, "utf8"));
} catch {
  die(
    `Dataset not found at supabase/seed/vn-geo.json.\n` +
      `Download a Vietnamese province+ward dataset (e.g. from https://provinces.open-api.vn/)\n` +
      `and save it there in the { code, name, wards:[{code,name}] } shape.`,
  );
}
if (!Array.isArray(provinces) || provinces.length === 0) {
  die("Dataset is empty or not an array.");
}

const supabase = createClient(url, key, { db: { schema: "bsk" }, auth: { persistSession: false } });

async function upsertBatched<T>(
  table: "provinces" | "wards",
  rows: T[],
  size = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await supabase.from(table).upsert(batch as never[]);
    if (error) die(`Upsert into ${table} failed at row ${i}: ${error.message}`);
    process.stdout.write(
      `[seed-geo] ${table}: ${Math.min(i + size, rows.length)}/${rows.length}\n`,
    );
  }
}

async function main() {
  const provinceRows = provinces.map((p) => ({ code: p.code, name: p.name }));
  const wardRows = provinces.flatMap((p) =>
    (p.wards ?? []).map((w) => ({ code: w.code, province_code: p.code, name: w.name })),
  );

  process.stdout.write(
    `[seed-geo] seeding ${provinceRows.length} provinces, ${wardRows.length} wards…\n`,
  );
  await upsertBatched("provinces", provinceRows);
  await upsertBatched("wards", wardRows);
  process.stdout.write("[seed-geo] done.\n");
}

main().catch((e) => die(String(e)));
