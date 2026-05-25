import "server-only";
import { z } from "zod";
import { APP_SLUG, SUPABASE_SCHEMA, clientEnv } from "./client";

const VERCEL_TO_APP_ENV = {
  production: "prod",
  preview: "preview",
  development: "dev",
} as const;

const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "preview", "production", "test"]).default("development"),
    // Vercel sets VERCEL_ENV automatically on every deploy. Absent → local dev.
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),

    SUPABASE_SECRET_KEY: z.string().min(1),

    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

    QSTASH_URL: z.url().optional(),
    QSTASH_TOKEN: z.string().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Cross-check NEXT_PUBLIC_APP_ENV against VERCEL_ENV so prod credentials
    // never silently write into a dev keyspace (and vice-versa). Skipped
    // locally (no VERCEL_ENV) where the developer owns their .env.local.
    if (!env.VERCEL_ENV) return;
    const expected = VERCEL_TO_APP_ENV[env.VERCEL_ENV];
    if (clientEnv.NEXT_PUBLIC_APP_ENV !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_APP_ENV"],
        message: `VERCEL_ENV=${env.VERCEL_ENV} requires NEXT_PUBLIC_APP_ENV=${expected}, got "${clientEnv.NEXT_PUBLIC_APP_ENV}". Set NEXT_PUBLIC_APP_ENV in Vercel project settings for this environment.`,
      });
    }
  });

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = Object.entries(parsed.error.flatten().fieldErrors)
    .map(([k, v]) => `  ${k}: ${(v ?? []).join(", ")}`)
    .join("\n");
  throw new Error(`Invalid server environment variables:\n${issues}`);
}

export const serverEnv = {
  ...parsed.data,
  ...clientEnv,
};

export { APP_SLUG, SUPABASE_SCHEMA };
export const redisKeyPrefix = `${APP_SLUG}:${clientEnv.NEXT_PUBLIC_APP_ENV}` as const;
