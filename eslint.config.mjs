import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const config = [
  { ignores: [".next/**", "node_modules/**", "dist/**", "out/**", ".vercel/**"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Force every call site through the prefixed / schema-scoped factories.
      // Raw clients bypass the bsk:{env}: Redis prefix and the schema='bsk'
      // scoping, which collide with sibling apps sharing the same project.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@upstash/redis",
              message:
                "Import the `cache` / `createRateLimiter` helpers from '@/lib/upstash' instead. Raw Redis bypasses the bsk:{env}: key prefix and can collide with sibling apps.",
            },
            {
              name: "@upstash/ratelimit",
              message:
                "Use `createRateLimiter` from '@/lib/upstash' instead — it bakes in the bsk:{env}:ratelimit prefix.",
            },
            {
              name: "@supabase/supabase-js",
              message:
                "Import the schema-scoped factory from '@/lib/supabase/{server,client,admin}' instead. Raw createClient bypasses db.schema='bsk' and reads/writes leak to public.",
            },
          ],
        },
      ],
    },
  },
  // Only the named factory files may import the raw infrastructure libs.
  // Explicit filenames (not a glob) keep the trust boundary tight — adding a
  // new factory should be a deliberate PR change here, not an accidental
  // file landing under `lib/supabase/*`.
  {
    files: [
      "lib/upstash.ts",
      "lib/supabase/server.ts",
      "lib/supabase/client.ts",
      "lib/supabase/admin.ts",
      "lib/supabase/session.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
