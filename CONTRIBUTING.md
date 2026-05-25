# Contributing to BSK

Educational rewrite of [lds217/BSK](https://github.com/lds217/BSK-All-in-One-Clinic-Management-System). See `PLAN.md` for the full phased roadmap.

## Cross-cutting rules

These apply everywhere. New code that violates them gets rejected at review.

### 1. Async `params` / `searchParams` (Next.js 16)

Always `await`:

```tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  // ...
}
```

If you forget to `await`, the value is a `Promise`, not a string — you get a runtime error, not a type error. The ESLint preset catches most cases. When importing third-party route snippets, run `npx @next/codemod@latest next-async-request-api .`.

### 2. `'use cache'` constraints

Implicit App Router caching is gone in Next.js 16. Caching is opt-in via the `'use cache'` directive.

- Cached functions **cannot** call `cookies()`, `headers()`, or read `searchParams` directly.
- Read those at the page/layout level, then pass scalar/serializable values into cached helpers as arguments.

```tsx
// ❌ wrong — cookies() inside cached scope
async function getUserDashboard() {
  "use cache";
  const cookieStore = await cookies(); // runtime error
}

// ✅ correct
export default async function Page() {
  const supabase = await createSupabaseServerClient(); // reads cookies()
  const { data: { user } } = await supabase.auth.getUser();
  return <Dashboard data={await getDashboardData(user!.id)} />;
}

async function getDashboardData(userId: string) {
  "use cache";
  // pure: only depends on userId
  // ...
}
```

### 3. Supabase + cache interaction

`lib/supabase/server.ts` reads cookies → never call it from a `'use cache'` function. Call it at the page/layout/Server-Action level and pass the data (not the client) into cached helpers.

`lib/supabase/admin.ts` does not depend on cookies and is safe to call from cached scopes — but only when the call is genuinely user-agnostic.

### 4. Realtime placement

Supabase Realtime channels are subscribed in **Client Components** (or Route Handlers), never in RSC and never inside `'use cache'`. Cached RSC fetches provide the initial snapshot; Realtime drives deltas.

Channel names must be prefixed with `bsk:` (e.g. `bsk:queue:{shift_id}`). Since the project's Supabase instance is shared across multiple side projects, unprefixed names will collide.

### 5. Supabase keys

Use the new key format:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser, replaces the old anon key.
- `SUPABASE_SECRET_KEY` — server-only, replaces the old service role key.

The legacy `supabase_key_*` format retires 2026-12-31; we do not use it.

### 6. Tailwind v4 shape

- PostCSS plugin: `@tailwindcss/postcss` (see `postcss.config.mjs`).
- Theme lives in `app/globals.css` under `@theme { … }`. No JS `tailwind.config.ts`.
- `shadcn` CLI v4 understands this layout; new components install into `components/ui/`.

### 7. Forms with React 19 + Server Actions

The standard recipe:

- **Schema:** Zod v4 in a shared module (importable from both client and server).
- **Client UX:** `react-hook-form` + `@hookform/resolvers/zod` for inline validation.
- **Submit:** `useActionState` (React 19) wraps the Server Action; the Server Action re-validates with the same Zod schema.
- **No wrappers:** do not introduce `next-safe-action`, `zsa`, or similar. The official React 19 API is sufficient.

### 8. Shared-infra namespacing

This project shares a Supabase project, an Upstash Redis DB, and a QStash account with several other side projects. Every persistent identifier must be `bsk`-prefixed:

| Surface | Prefix | Example |
|---|---|---|
| Postgres schema | `bsk` | `bsk.patients` |
| Migration filename | `bsk_` segment | `20260601000000_bsk_init.sql` |
| RLS helper | `bsk.` | `bsk.current_role()` |
| Redis key | `bsk:{env}:` | `bsk:prod:cache:queue:42` |
| Rate-limit bucket | `bsk:{env}:ratelimit:` | `bsk:prod:ratelimit:login` |
| Realtime channel | `bsk:` | `bsk:queue:{shift_id}` |
| Storage bucket | `bsk-` | `bsk-checkup-media` |
| QStash topic | `bsk-` | `bsk-recheckup-reminders` |

`lib/upstash.ts` enforces the Redis + rate-limit prefixes — use those helpers, not raw `Redis` instances. `lib/supabase/*.ts` bakes in `db: { schema: 'bsk' }` — use those, not raw `createClient`.

Never run `KEYS *`, `FLUSHDB`, `FLUSHALL`, or `supabase db reset` against the shared infra.

## Workflow

```bash
pnpm install          # one-time
pnpm dev              # local dev (Turbopack)
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm build            # production build
pnpm format           # prettier --write .
```

## Commit hygiene

- Conventional commits (`docs:`, `feat:`, `fix:`, `chore:`, `test:`).
- One concern per commit.
- Scope by feature when useful (`feat(queue): …`).
