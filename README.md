# BSK (Rewrite)

An educational rewrite of the **BSK All-in-One Clinic Management System** into a modern web stack.

> **Original project:** [lds217/BSK-All-in-One-Clinic-Management-System](https://github.com/lds217/BSK-All-in-One-Clinic-Management-System) by **[@lds217](https://github.com/lds217)** — a Java/Swing desktop application with a Netty server and SQLite backend, built for small Vietnamese clinics.
>
> This repository is a **clean-room reimplementation for learning purposes**. No source code is copied from the original; features and data shapes are reimplemented from the upstream README and observable behavior. See [NOTICE](./NOTICE) for full attribution.

## Status

Planning phase. See [PLAN.md](./PLAN.md) for the architecture and phased roadmap.

## Stack

- **pnpm** + **Next.js 16** (App Router) + **TypeScript**
- **Supabase** (Postgres + Auth + Storage) — shared across personal projects via schema-per-app
- **Upstash** Redis + QStash — shared across personal projects via key prefixes
- **Vercel** for hosting
- **shadcn/ui** + Tailwind CSS

## Important disclaimers

- **Educational use only.** This codebase is not certified for clinical use and must never be deployed against real patient data. Use synthetic data only.
- **No HIPAA / GDPR compliance** is implied or attempted on the free-tier infrastructure.
- This is a derivative work for learning; if you are the upstream author and would like additional attribution or removal, please open an issue.

## Database

After `pnpm db:push`, run `pnpm db:gen-types` to refresh `types/supabase-bsk.ts`.

## License

This repository is licensed under the [Apache License 2.0](./LICENSE). The original project does not currently carry an explicit license; see [NOTICE](./NOTICE) for the attribution stance.
