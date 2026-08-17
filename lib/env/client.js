import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(["dev", "preview", "prod"]).default("dev"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const parsed = clientSchema.safeParse({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  const issues = Object.entries(parsed.error.flatten().fieldErrors)
    .map(([k, v]) => `  ${k}: ${(v ?? []).join(", ")}`)
    .join("\n");
  throw new Error(`Invalid public environment variables:\n${issues}`);
}

export const clientEnv = parsed.data;

export const APP_SLUG = "bsk" as const;
export const SUPABASE_SCHEMA = "bsk" as const;
