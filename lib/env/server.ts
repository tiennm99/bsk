import "server-only";
import { z } from "zod";
import { APP_SLUG, SUPABASE_SCHEMA, clientEnv } from "./client";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "preview", "production", "test"]).default("development"),

  SUPABASE_SECRET_KEY: z.string().min(1),

  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  QSTASH_URL: z.url().optional(),
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
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
