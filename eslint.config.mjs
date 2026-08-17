import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      ".vercel/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  prettier,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
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
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            FunctionExpression: true,
            ArrowFunctionExpression: true,
          },
        },
      ],
      "jsdoc/require-param-type": "warn",
      "jsdoc/require-returns-type": "warn",
    },
  },
  // Only the named factory files may import the raw infrastructure libs.
  // Explicit filenames (not a glob) keep the trust boundary tight — adding a
  // new factory should be a deliberate PR change here, not an accidental
  // file landing under `lib/supabase/*`.
  {
    files: [
      "lib/upstash.js",
      "lib/supabase/server.js",
      "lib/supabase/client.js",
      "lib/supabase/admin.js",
      "lib/supabase/session.js",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  // Standalone Node scripts (seed/preflight) run outside Next and legitimately
  // build their own schema-scoped client from env — not the request factories.
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs"],
    rules: { "no-restricted-imports": "off" },
  },
  // Test files (unit/e2e) and config files are exempt from Next.js rules.
  {
    files: ["tests/**/*.js", "*.config.js", "*.config.mjs"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];

export default config;
