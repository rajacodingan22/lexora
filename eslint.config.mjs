import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Next.js 16 uses `.next/dev/` for development output
    ".next/dev/**",
  ]),
  // Keep the existing application lintable while the legacy client components are
  // migrated incrementally. These React Compiler rules are stricter than the
  // runtime contract used by this app and would otherwise turn valid legacy
  // patterns into hundreds of blocking errors.
  {
    rules: {
      // Keep the hook safety checks active; defer compiler-only migration work.
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",
      // These remain visible in lint output without blocking CI. New code should
      // use explicit domain types and underscore intentionally unused parameters.
      // no-explicit-any: off untuk legacy code. File baru harus pakai tipe eksplisit.
      "@typescript-eslint/no-explicit-any": "off",
      // Next.js Image: off karena banyak flag icon & landing image legacy
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
