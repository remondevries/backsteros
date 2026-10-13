// ESLint flat config for the desktop shell (`src/`) and desktop-owned UI
// (`packages/ui/src/`). Focus: hooks correctness + TypeScript hygiene.
// Formatting is not linted here.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "packages/ui/dist/**",
      "public/**",
      "src-tauri/**",
      "scripts/**",
      "node_modules/**",
      "**/*.d.ts",
      "vite.config.ts",
      "vite.manual-chunks.ts",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Hooks correctness — the main reason this config exists.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript hygiene. `tsc --noEmit` already enforces noUnusedLocals in
      // the app tsconfig; keep ESLint aligned and allow the `_` convention.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // `{}` / `object` / `Function` are occasionally legitimate in generic
      // adapter code; keep as warnings rather than errors.
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",

      // Debug logging should not ship; warn/error are allowed.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    // Tests: node:test globals and looser rules.
    files: ["src/**/*.test.ts", "packages/ui/src/**/*.test.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },
);
